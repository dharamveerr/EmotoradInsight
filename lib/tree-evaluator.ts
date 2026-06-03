import { TreeNode, TreeCondition, ChatbotEvent } from "./types";

/**
 * Evaluate if metadata matches all conditions (AND logic)
 */
export function evaluateConditions(
  metadata: Record<string, any> | null,
  conditions: TreeCondition[] | undefined
): boolean {
  if (!conditions || conditions.length === 0) return true;
  if (!metadata) return false;

  return conditions.every((cond) => evaluateCondition(metadata, cond));
}

/**
 * Evaluate a single condition
 */
function evaluateCondition(metadata: Record<string, any>, cond: TreeCondition): boolean {
  const value = metadata[cond.variable];

  if (value === undefined || value === null) return false;

  switch (cond.operator) {
    case "equals":
      return String(value) === String(cond.value);
    case "contains":
      return String(value).includes(String(cond.value));
    case "startsWith":
      return String(value).startsWith(String(cond.value));
    case "range":
      if (!Array.isArray(cond.value) || cond.value.length !== 2) return false;
      const [min, max] = cond.value;
      const numValue = Number(value);
      return !isNaN(numValue) && numValue >= min && numValue <= max;
    default:
      return false;
  }
}

/**
 * Find which tree leaf an event belongs to
 * Returns the leaf node if matched, null otherwise
 */
export function classifyEventToTreeNode(
  event: ChatbotEvent | null,
  tree: TreeNode | null
): TreeNode | null {
  if (!event || !tree) return null;

  const metadata = event.metadata ? JSON.parse(event.metadata) : {};
  return findMatchingLeaf(tree, metadata);
}

/**
 * Recursively find matching leaf node in tree
 */
function findMatchingLeaf(
  node: TreeNode,
  metadata: Record<string, any>
): TreeNode | null {
  // Check if current node's conditions match
  if (!evaluateConditions(metadata, node.conditions)) {
    return null;
  }

  // If no children, this is a leaf
  if (!node.children || node.children.length === 0) {
    return node;
  }

  // Try to find matching child
  for (const child of node.children) {
    const match = findMatchingLeaf(child, metadata);
    if (match) return match;
  }

  // If no children matched, return current node (intermediate node)
  return node;
}

/**
 * Get string path of node in tree (for display)
 * E.g., "Root > Premium > EM-100"
 */
export function getTreeNodePath(node: TreeNode, tree: TreeNode): string {
  const path: string[] = [];
  findPathToNode(tree, node.id, path);
  return path.map((n) => n).join(" > ");
}

function findPathToNode(
  current: TreeNode,
  targetId: string,
  path: string[]
): boolean {
  path.push(current.name);

  if (current.id === targetId) {
    return true;
  }

  if (current.children) {
    for (const child of current.children) {
      if (findPathToNode(child, targetId, path)) {
        return true;
      }
    }
  }

  path.pop();
  return false;
}

/**
 * Get all leaf nodes from tree
 */
export function getTreeLeaves(node: TreeNode): TreeNode[] {
  if (!node.children || node.children.length === 0) {
    return [node];
  }

  const leaves: TreeNode[] = [];
  for (const child of node.children) {
    leaves.push(...getTreeLeaves(child));
  }
  return leaves;
}
