export { renderSvg, type RenderOptions } from "./engine.js";
export { flattenContainers, hideNotes, stripSections } from "./filters.js";
export { applyLinks, type LinkEntry, type LinkSpec } from "./links.js";
export { pumlToIr } from "./frontend.js";
export { treeToIr, type CstNode } from "./frontend-core.js";
export { expandIncludes, type IncludeLoader } from "./preprocess.js";
export {
  IrValidationError,
  validateIr,
  type IrEdge,
  type IrLinks,
  type IrNode,
  type RenderIr,
} from "./ir.js";
