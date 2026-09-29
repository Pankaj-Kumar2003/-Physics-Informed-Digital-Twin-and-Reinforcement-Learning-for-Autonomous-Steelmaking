from __future__ import annotations

import argparse

from src.common.config import load_config
from src.digital_twin.simulator import SteelmakingDigitalTwin
from src.rl_agent.agent import AlloyControlAgent


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export a trained PPO policy for deployment")
    parser.add_argument(
        "--config",
        default="config/default.yaml",
        help="Path to the YAML config used to build the digital twin",
    )
    parser.add_argument(
        "--checkpoint",
        required=True,
        help="Path to the PPO checkpoint produced by training",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Destination file for the exported actor (e.g., exports/policy.ts or policy.onnx)",
    )
    parser.add_argument(
        "--format",
        choices=["torchscript", "onnx"],
        default="torchscript",
        help="Serialization format to use",
    )
    parser.add_argument(
        "--device",
        default="auto",
        help="Override device to load the actor on before exporting",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    project_cfg = load_config(args.config)
    twin = SteelmakingDigitalTwin(project_cfg.plant)
    agent = AlloyControlAgent.from_checkpoint(twin, args.checkpoint, device=args.device)
    exported = agent.export_actor(args.output, fmt=args.format)
    print(f"Exported actor to {exported} in {args.format} format")


if __name__ == "__main__":
    main()
