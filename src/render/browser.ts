/**
 * Browser/webview entry: everything needed to render without node —
 * the engine plus the environment-neutral frontend core. Pair it with
 * web-tree-sitter and the grammar's .wasm on the consumer side.
 */

export { renderSvg } from "./engine.js";
export { treeToIr, type CstNode } from "./frontend-core.js";
export {
  IrValidationError,
  validateIr,
  type IrEdge,
  type IrNode,
  type RenderIr,
} from "./ir.js";
