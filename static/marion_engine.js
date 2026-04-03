/**
 * A* Pathfinding Implementation for Indoor Navigation
 * Calculates the shortest path between two nodes in the MAP_DATA graph,
 * respecting accessibility constraints (e.g., wheelchair routing).
 */

class Pathfinder {
    constructor(mapData) {
        this.nodes = mapData.nodes;
        this.edges = mapData.edges;
        this.adjacencyList = this.buildAdjacencyList();
    }

    // Convert the edge list into a graph representation
    buildAdjacencyList() {
        const list = {};
        for (const nodeId in this.nodes) {
            list[nodeId] = [];
        }

        this.edges.forEach(edge => {
            if (this.nodes[edge.from] && this.nodes[edge.to]) {
                // Bi-directional graph (can walk both ways unless specifically marked otherwise)
                list[edge.from].push({ node: edge.to, cost: edge.distance, edgeData: edge });
                list[edge.to].push({ node: edge.from, cost: edge.distance, edgeData: edge });
            }
        });
        return list;
    }

    // Heuristic function for A* (Euclidean distance between current node and target node)
    heuristic(nodeA, nodeB) {
        const a = this.nodes[nodeA];
        const b = this.nodes[nodeB];
        return Math.sqrt(
            Math.pow(a.x - b.x, 2) +
            Math.pow(a.y - b.y, 2) +
            Math.pow(a.z - b.z, 2)
        );
    }

    // Main A* Search Algorithm
    findPath(startId, goalId, requireAccessible = false) {
        if (!this.nodes[startId] || !this.nodes[goalId]) {
            return null; // Invalid start or goal
        }

        const openSet = [startId];
        const cameFrom = {};
        
        // Use maps to store scores; initialize with Infinity
        const gScore = {};
        const fScore = {};
        for (const nodeId in this.nodes) {
            gScore[nodeId] = Infinity;
            fScore[nodeId] = Infinity;
        }

        gScore[startId] = 0;
        fScore[startId] = this.heuristic(startId, goalId);

        while (openSet.length > 0) {
            // Find node in openSet with lowest fScore
            let current = openSet[0];
            let lowestF = fScore[current];
            for (let i = 1; i < openSet.length; i++) {
                if (fScore[openSet[i]] < lowestF) {
                    current = openSet[i];
                    lowestF = fScore[current];
                }
            }

            if (current === goalId) {
                return this.reconstructPath(cameFrom, current);
            }

            // Remove current from openSet
            openSet.splice(openSet.indexOf(current), 1);

            const neighbors = this.adjacencyList[current];
            for (const neighbor of neighbors) {
                
                // Accessibility Check
                if (requireAccessible && neighbor.edgeData.accessible === false) {
                    continue; // Skip this edge (e.g., stairs)
                }

                const tentative_gScore = gScore[current] + neighbor.cost;

                if (tentative_gScore < gScore[neighbor.node]) {
                    // This path to neighbor is better than any previous one
                    cameFrom[neighbor.node] = current;
                    gScore[neighbor.node] = tentative_gScore;
                    fScore[neighbor.node] = gScore[neighbor.node] + this.heuristic(neighbor.node, goalId);

                    if (!openSet.includes(neighbor.node)) {
                        openSet.push(neighbor.node);
                    }
                }
            }
        }

        // Open set is empty but goal was never reached
        return null;
    }

    reconstructPath(cameFrom, current) {
        const totalPath = [current];
        while (cameFrom[current]) {
            current = cameFrom[current];
            totalPath.unshift(current);
        }
        return totalPath;
    }
}
