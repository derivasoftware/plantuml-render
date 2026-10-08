export { renderSvg, type RenderOptions } from "./engine.js";
export {
  attachFocus,
  neighbourhood,
  type Focused,
  type FocusOptions,
  type Link,
  type Neighbourhood,
} from "./focus.js";
export {
  filterMembers,
  flattenContainers,
  hideNotes,
  type MemberContext,
  stripSections,
} from "./filters.js";
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
