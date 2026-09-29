from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, Sequence

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset

from common.logging import get_logger
from common.types import ProcessState, TwinBatch

LOGGER = get_logger(__name__)


@dataclass
class PINNConfig:
    """Training hyperparameters for the physics-informed surrogate."""

    hidden_sizes: Sequence[int] = (128, 128)
    learning_rate: float = 1e-3
    weight_decay: float = 1e-5
    lambda_physics: float = 0.2
    epochs: int = 500
    batch_size: int = 128
    device: str = "auto"


class PhysicsInformedSteelPINN(nn.Module):
    """Feed-forward PINN that enforces mass balance and metallurgical priors."""

    def __init__(self, input_dim: int, output_dim: int, hidden_sizes: Sequence[int]) -> None:
        super().__init__()
        layers: list[nn.Module] = []
        prev_dim = input_dim
        for hidden in hidden_sizes:
            layers.append(nn.Linear(prev_dim, hidden))
            layers.append(nn.SiLU())
            prev_dim = hidden
        layers.append(nn.Linear(prev_dim, output_dim))
        self.network = nn.Sequential(*layers)

    def forward(self, features: torch.Tensor) -> torch.Tensor:
        return self.network(features)


def _build_feature_matrix(batch: TwinBatch) -> np.ndarray:
    states = batch.states
    if not states:
        raise ValueError("TwinBatch must contain at least one state")
    elements = sorted({el for state in states for el in state.composition_pct})
    rows = []
    for state in states:
        row = [state.temperature_c / 2000.0]
        row.extend(state.composition_pct.get(el, 0.0) for el in elements)
        row.extend(state.slag_state.get(key, 0.0) / 100 for key in ("FeO", "SiO2"))
        rows.append(row)
    return np.asarray(rows, dtype=float)


def _build_targets(states: list[ProcessState]) -> np.ndarray:
    targets = []
    for state in states:
        targets.append(
            [
                state.composition_pct.get("C", 0.0),
                state.composition_pct.get("Mn", 0.0),
                state.composition_pct.get("Si", 0.0),
                state.temperature_c / 2000.0,
            ]
        )
    return np.asarray(targets, dtype=float)


def _physics_penalty(predictions: torch.Tensor) -> torch.Tensor:
    compositions = predictions[:, :3]
    mass_violation = torch.relu(compositions.sum(dim=1) - 1.0)
    carbon_floor = torch.relu(0.02 - compositions[:, 0])
    temperature_band = torch.relu(0.7 - predictions[:, 3])
    return mass_violation.mean() + carbon_floor.mean() + 0.5 * temperature_band.mean()


def _select_device(preferred: str) -> torch.device:
    if preferred.lower() == "auto":
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")
    return torch.device(preferred)


def train_model(batch: TwinBatch, cfg: PINNConfig | None = None) -> Dict[str, float]:
    """Train the PyTorch PINN surrogate and return diagnostics."""

    cfg = cfg or PINNConfig()
    features = _build_feature_matrix(batch)
    targets = _build_targets(batch.states)
    input_dim = features.shape[1]
    output_dim = targets.shape[1]

    tensor_features = torch.from_numpy(features).float()
    tensor_targets = torch.from_numpy(targets).float()
    dataset = TensorDataset(tensor_features, tensor_targets)
    loader = DataLoader(dataset, batch_size=cfg.batch_size, shuffle=True)

    device = _select_device(cfg.device)
    model = PhysicsInformedSteelPINN(input_dim, output_dim, cfg.hidden_sizes).to(device)
    optimizer = torch.optim.AdamW(
        model.parameters(), lr=cfg.learning_rate, weight_decay=cfg.weight_decay
    )
    criterion = nn.MSELoss()

    for epoch in range(cfg.epochs):
        running_loss = 0.0
        model.train()
        for batch_features, batch_targets in loader:
            batch_features = batch_features.to(device)
            batch_targets = batch_targets.to(device)
            optimizer.zero_grad(set_to_none=True)
            predictions = model(batch_features)
            data_loss = criterion(predictions, batch_targets)
            physics_loss = _physics_penalty(predictions)
            loss = data_loss + cfg.lambda_physics * physics_loss
            loss.backward()
            optimizer.step()
            running_loss += loss.item() * batch_features.size(0)
        if (epoch + 1) % max(1, cfg.epochs // 5) == 0 or epoch == cfg.epochs - 1:
            LOGGER.info(
                "PINN epoch=%s loss=%.4f",
                epoch + 1,
                running_loss / len(dataset),
            )

    model.eval()
    with torch.no_grad():
        preds = model(tensor_features.to(device)).cpu()
    mse = float(nn.functional.mse_loss(preds, tensor_targets).item())
    physics = float(_physics_penalty(preds).item())
    loss = mse + cfg.lambda_physics * physics

    ckpt_path = Path("experiments/piml_weights.pt")
    ckpt_path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "state_dict": model.state_dict(),
            "input_dim": input_dim,
            "output_dim": output_dim,
            "config": asdict(cfg),
        },
        ckpt_path,
    )
    LOGGER.info("PIML metrics mse=%.4f physics=%.4f", mse, physics)
    return {
        "loss": loss,
        "mse": mse,
        "physics_loss": physics,
        "checkpoint": str(ckpt_path),
        "device": str(device),
    }
