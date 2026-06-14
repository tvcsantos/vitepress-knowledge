import { createApp } from "@aklinker1/zeta";
import { deps } from "../dependencies";

export const decorateContextPlugin = createApp().decorate(deps).export();
