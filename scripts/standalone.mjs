// Entry of the standalone executables (REQ-00014-1). Bun embeds the files
// imported with `type: "file"` / `type: "text"` into the binary, so the
// grammar, the parser runtime and the manual travel inside it; the CLI is
// the same `main` the npm package runs.
import { configureParser } from "../out/render/frontend.js";
import { main } from "../out/render/cli.js";
import grammarWasm from "../grammar/tree-sitter-plantuml.wasm" with { type: "file" };
import runtimeWasm from "../node_modules/web-tree-sitter/web-tree-sitter.wasm" with { type: "file" };
import diagrams from "../doc/manual/diagrams.md" with { type: "text" };
import embedding from "../doc/manual/embedding.md" with { type: "text" };
import navigation from "../doc/manual/navigation.md" with { type: "text" };
import style from "../doc/manual/style.md" with { type: "text" };
import contract from "../doc/manual/contract.md" with { type: "text" };

const bytes = async (path) => new Uint8Array(await Bun.file(path).arrayBuffer());
configureParser({ grammar: await bytes(grammarWasm), runtime: await bytes(runtimeWasm) });
process.exitCode = await main(process.argv.slice(2), {
  docs: { diagrams, embedding, navigation, style, contract },
});
