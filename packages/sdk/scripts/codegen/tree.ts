/**
 * The resource namespace tree: `accounts.jobs.create` → accounts → jobs → create.
 * Built once from the operation ids so SDK methods and CLI commands share it.
 */
import type { OperationInfo } from "../../src/core/catalog-types.js";

export interface TreeNode {
    readonly children: Map<string, TreeNode>;
    op: OperationInfo | null;
}

/** Hand-written members that generated names must never collide with. */
export const RESERVED_IDS: readonly string[] = ["jobs.wait"];
export const RESERVED_ROOTS: readonly string[] = ["request", "call", "paginate", "baseUrl"];

function newNode(): TreeNode {
    return { children: new Map(), op: null };
}

function insert(root: TreeNode, op: OperationInfo): void {
    const segments = op.id.split(".");
    let node = root;
    for (const seg of segments) {
        if (!/^[A-Za-z_$][\w$]*$/.test(seg)) throw new Error(`${op.id}: segment "${seg}" is not a valid identifier`);
        if (node.op) throw new Error(`${op.id}: "${seg}" nests under an operation`);
        let child = node.children.get(seg);
        if (!child) {
            child = newNode();
            node.children.set(seg, child);
        }
        node = child;
    }
    if (node.op || node.children.size > 0) throw new Error(`${op.id}: name is both an operation and a namespace`);
    node.op = op;
}

export function buildTree(ops: readonly OperationInfo[]): TreeNode {
    for (const op of ops) {
        if (RESERVED_IDS.includes(op.id) || RESERVED_ROOTS.includes(op.id.split(".")[0] ?? "")) throw new Error(`${op.id}: collides with a hand-written SDK member`);
    }
    const root = newNode();
    for (const op of ops) insert(root, op);
    return root;
}
