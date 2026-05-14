# Sherpa Swarm: Distributed AI Architecture

## 1. System Overview
**Sherpa Swarm** is a distributed, peer-to-peer AI inference engine that allows users to pool their idle GPU VRAM and compute power across a network to run massive, enterprise-grade LLMs that would be impossible to run on a single machine.

## 2. Frontend Capabilities & UI

### Connection Modes
The main dashboard will feature a primary selector for the Swarm Mode:
- **Local Area Network (LAN):** Automatically discovers and pairs with other Sherpa Nodes on the exact same Wi-Fi/Ethernet network for ultra-low latency pipeline parallelism.
- **10 PCs Near Me (WAN):** Connects to the broader internet-based Sherpa Swarm, prioritizing geographic proximity.

### The Swarm Node Selector (Popup)
When "10 PCs Near Me" is selected, the UI triggers an interactive modal:
- **Node Discovery:** The system pings the central Sherpa tracker to find available nodes.
- **Scoring Algorithm:** Nodes are dynamically ranked based on a composite "Performance Score":
  - *Bandwidth:* Ping (ms) and Upload/Download capacity.
  - *Hardware:* Available VRAM (GB) and GPU Compute Capability (e.g., RTX 4090 > GTX 1080).
- **Auto-Selection:** The top 10 highest-scoring nodes are automatically checked to form the user's specific processing pipeline.
- **Customization:** Users can manually uncheck nodes or view detailed stats (e.g., "User45 - 24GB VRAM - 12ms Ping").

## 3. Backend & Security

### End-to-End Encryption (E2EE)
Because sensitive prompts are being divided and sent to other users' hardware, raw text cannot be transmitted in the clear.
- **Transport Security:** All node-to-node communication will be wrapped in TLS 1.3 (HTTPS/WSS) or a custom WireGuard tunnel.
- **Activation Encryption:** Instead of sending raw text, the initial node converts the text into mathematical embeddings (matrices of numbers). Only these abstract numbers are sent to the external nodes for processing. Without the initial vocabulary dictionary, the external nodes cannot reverse-engineer the numbers back into the user's readable text.

### Distributed Backend Engine
- **Orchestration:** A FastAPI backend acts as the orchestrator to manage state and serve the UI.
- **Inference Engine:** Utilizing a specialized backend capable of RPC (Remote Procedure Call) tensor splitting (e.g., customized `llama.cpp` RPC servers or a Petals-like DHT network) to distribute model layers across the selected 10 PCs.
