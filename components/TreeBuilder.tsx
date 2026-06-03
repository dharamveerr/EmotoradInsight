"use client";

import { useState } from "react";
import { TreeNode, TreeCondition } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

interface TreeBuilderProps {
  tree: TreeNode | null;
  draggedVariable: string | null;
  onTreeChange: (tree: TreeNode) => void;
}

function NodeRow({
  node,
  level,
  tree,
  onUpdateNode,
  onAddChild,
  onDeleteNode,
  onEditConditions,
}: {
  node: TreeNode;
  level: number;
  tree: TreeNode;
  onUpdateNode: (id: string, updates: Partial<TreeNode>) => void;
  onAddChild: (parentId: string) => void;
  onDeleteNode: (id: string) => void;
  onEditConditions: (node: TreeNode) => void;
}) {
  return (
    <div>
      <div
        className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 rounded group"
        style={{ marginLeft: `${level * 24}px` }}
      >
        {/* Indent indicator */}
        {level > 0 && <span className="text-gray-500">↳</span>}

        {/* Node name input */}
        <input
          type="text"
          value={node.name}
          onChange={(e) => onUpdateNode(node.id, { name: e.target.value })}
          placeholder="Node name…"
          className="flex-1 bg-white/10 border border-white/10 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
        />

        {/* Node type badge */}
        <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-semibold">
          {node.type}
        </span>

        {/* Actions */}
        <button
          onClick={() => onEditConditions(node)}
          className="text-xs px-2 py-1 bg-purple-500/20 text-purple-300 rounded hover:bg-purple-500/30 transition-colors opacity-0 group-hover:opacity-100"
          title="Edit conditions"
        >
          ⚙️ Cond
        </button>

        {node.type === "category" && (
          <button
            onClick={() => onAddChild(node.id)}
            className="text-xs px-2 py-1 bg-green-500/20 text-green-300 rounded hover:bg-green-500/30 transition-colors opacity-0 group-hover:opacity-100"
            title="Add child"
          >
            + Child
          </button>
        )}

        <button
          onClick={() => onDeleteNode(node.id)}
          className="text-xs px-2 py-1 bg-red-500/20 text-red-300 rounded hover:bg-red-500/30 transition-colors opacity-0 group-hover:opacity-100"
          title="Delete node"
        >
          ✕
        </button>
      </div>

      {/* Render children */}
      {node.children && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <NodeRow
              key={child.id}
              node={child}
              level={level + 1}
              tree={tree}
              onUpdateNode={onUpdateNode}
              onAddChild={onAddChild}
              onDeleteNode={onDeleteNode}
              onEditConditions={onEditConditions}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TreeBuilder({
  tree,
  draggedVariable,
  onTreeChange,
}: TreeBuilderProps) {
  const [editingNode, setEditingNode] = useState<TreeNode | null>(null);
  const [newCondition, setNewCondition] = useState<TreeCondition>({
    variable: "",
    operator: "equals",
    value: "",
  });

  const findNodeById = (node: TreeNode, id: string): TreeNode | null => {
    if (node.id === id) return node;
    if (node.children) {
      for (const child of node.children) {
        const found = findNodeById(child, id);
        if (found) return found;
      }
    }
    return null;
  };

  const updateNodeInTree = (
    node: TreeNode,
    id: string,
    updates: Partial<TreeNode>
  ): TreeNode => {
    if (node.id === id) {
      return { ...node, ...updates };
    }
    if (node.children) {
      return {
        ...node,
        children: node.children.map((child) => updateNodeInTree(child, id, updates)),
      };
    }
    return node;
  };

  const deleteNodeFromTree = (node: TreeNode, id: string): TreeNode => {
    if (node.children) {
      return {
        ...node,
        children: node.children
          .filter((c) => c.id !== id)
          .map((c) => deleteNodeFromTree(c, id)),
      };
    }
    return node;
  };

  const addChildToNode = (node: TreeNode, parentId: string): TreeNode => {
    if (node.id === parentId) {
      const newChild: TreeNode = {
        id: uuidv4(),
        name: "New Leaf",
        type: "leaf",
        conditions: [],
        children: [],
      };
      return {
        ...node,
        children: [...(node.children || []), newChild],
      };
    }
    if (node.children) {
      return {
        ...node,
        children: node.children.map((c) => addChildToNode(c, parentId)),
      };
    }
    return node;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add("bg-blue-500/10");
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove("bg-blue-500/10");
  };

  const handleDrop = (e: React.DragEvent, parentId: string | null) => {
    e.preventDefault();
    e.currentTarget.classList.remove("bg-blue-500/10");

    const variable = e.dataTransfer?.getData("variable");
    if (!variable || !tree) return;

    // Add new child node to root
    if (parentId === null) {
      const newChild: TreeNode = {
        id: uuidv4(),
        name: variable.replace("@", ""),
        type: "leaf",
        conditions: [
          {
            variable: variable,
            operator: "equals",
            value: "",
          },
        ],
        children: [],
      };
      const updated = {
        ...tree,
        children: [...(tree.children || []), newChild],
      };
      onTreeChange(updated);
    } else {
      // Add child to existing node
      const parent = findNodeById(tree, parentId);
      if (parent) {
        const newChild: TreeNode = {
          id: uuidv4(),
          name: variable.replace("@", ""),
          type: "leaf",
          conditions: [
            {
              variable: variable,
              operator: "equals",
              value: "",
            },
          ],
          children: [],
        };
        const updated = updateNodeInTree(tree, parentId, {
          children: [...(parent.children || []), newChild],
        });
        onTreeChange(updated);
      }
    }
  };

  if (!tree) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        Create or select a tree to get started
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-auto bg-white/3">
      {/* Canvas Header */}
      <div className="p-4 border-b border-white/10 shrink-0">
        <h3 className="text-sm font-bold text-white">{tree.name || "Untitled Tree"}</h3>
        <p className="text-xs text-gray-500 mt-1">Build your tree by dragging variables</p>
      </div>

      {/* Tree structure */}
      <div
        className="flex-1 p-4 overflow-y-auto transition-colors"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, null)}
        style={{ minHeight: '200px' }}
      >
        {tree && (
          <NodeRow
            node={tree}
            level={0}
            tree={tree}
            onUpdateNode={(id, updates) => {
              onTreeChange(updateNodeInTree(tree, id, updates));
            }}
            onAddChild={(parentId) => {
              onTreeChange(addChildToNode(tree, parentId));
            }}
            onDeleteNode={(id) => {
              onTreeChange(deleteNodeFromTree(tree, id));
            }}
            onEditConditions={(node) => {
              setEditingNode(node);
            }}
          />
        )}
      </div>

      {/* Condition Editor Modal */}
      {editingNode && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-96 flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-white/10">
              <h3 className="font-bold text-white">Edit Conditions: {editingNode.name}</h3>
            </div>

            {/* Conditions List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {(editingNode.conditions || []).map((cond, idx) => (
                <div key={idx} className="flex gap-2 items-end">
                  <input
                    type="text"
                    value={cond.variable}
                    readOnly
                    className="flex-1 bg-white/10 border border-white/10 rounded px-2 py-1 text-xs text-gray-400"
                  />
                  <select
                    value={cond.operator}
                    onChange={(e) => {
                      const updated = (editingNode.conditions || []).map((c, i) =>
                        i === idx ? { ...c, operator: e.target.value as any } : c
                      );
                      setEditingNode({ ...editingNode, conditions: updated });
                    }}
                    className="bg-white/10 border border-white/10 rounded px-2 py-1 text-xs text-gray-200"
                  >
                    <option value="equals">equals</option>
                    <option value="contains">contains</option>
                    <option value="startsWith">startsWith</option>
                    <option value="range">range</option>
                  </select>
                  <input
                    type="text"
                    value={String(cond.value)}
                    onChange={(e) => {
                      const updated = (editingNode.conditions || []).map((c, i) =>
                        i === idx ? { ...c, value: e.target.value } : c
                      );
                      setEditingNode({ ...editingNode, conditions: updated });
                    }}
                    placeholder="value"
                    className="w-24 bg-white/10 border border-white/10 rounded px-2 py-1 text-xs text-gray-200"
                  />
                  <button
                    onClick={() => {
                      const updated = (editingNode.conditions || []).filter(
                        (_, i) => i !== idx
                      );
                      setEditingNode({ ...editingNode, conditions: updated });
                    }}
                    className="px-2 py-1 bg-red-500/20 text-red-300 rounded text-xs hover:bg-red-500/30"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="border-t border-white/10 p-4 flex gap-2">
              <button
                onClick={() => {
                  const updated = updateNodeInTree(tree, editingNode.id, {
                    conditions: editingNode.conditions,
                  });
                  onTreeChange(updated);
                  setEditingNode(null);
                }}
                className="flex-1 px-4 py-2 bg-green-500/20 text-green-300 rounded font-semibold text-xs hover:bg-green-500/30"
              >
                Save
              </button>
              <button
                onClick={() => setEditingNode(null)}
                className="flex-1 px-4 py-2 bg-white/10 text-gray-300 rounded font-semibold text-xs hover:bg-white/20"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
