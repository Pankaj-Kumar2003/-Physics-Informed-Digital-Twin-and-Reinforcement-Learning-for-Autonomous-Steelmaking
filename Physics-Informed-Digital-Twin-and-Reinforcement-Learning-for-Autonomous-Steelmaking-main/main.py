from __future__ import annotations

import argparse

from orchestrator.pipeline import OrchestratorConfig, SteelmakingOrchestrator


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the AI steelmaking orchestrator")
    parser.add_argument(
        "command",
        choices=["orchestrate"],
        help="Pipeline command to execute",
    )
    parser.add_argument(
        "--config",
        default="config/default.yaml",
        help="Path to the YAML configuration file",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.command == "orchestrate":
        orchestrator = SteelmakingOrchestrator(
            OrchestratorConfig(config_path=args.config)
        )
        artifacts = orchestrator.run()
        print("Artifacts produced:", artifacts)


if __name__ == "__main__":
    main()
