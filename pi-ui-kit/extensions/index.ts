import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createUiKit } from "../src/index.ts";

export default function (pi: ExtensionAPI) {
  createUiKit(pi).install();
}
