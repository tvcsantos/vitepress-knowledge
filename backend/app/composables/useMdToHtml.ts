import { useEventListener } from "@vueuse/core";
import {
  mdToHtml,
  ensureLanguagesLoaded,
  MARKDOWN_SYNTAX_HIGHLIGHTER_READY_EVENT,
} from "../utils/md-to-html";
import { computed, ref, toValue, watch, type MaybeRefOrGetter } from "vue";
import type { ComputedRef } from "vue";

export default function (md: MaybeRefOrGetter<string>): ComputedRef<string> {
  const trigger = ref(0);

  const html = computed(() => {
    // Access the trigger value so this value is recomputed when it changes.
    void trigger.value;

    return mdToHtml(toValue(md));
  });
  // Lazily load grammars for any languages used in the markdown.
  watch(
    () => toValue(md),
    (value) => void ensureLanguagesLoaded(value),
    {
      immediate: true,
    },
  );
  useEventListener(window, MARKDOWN_SYNTAX_HIGHLIGHTER_READY_EVENT, () => {
    trigger.value++;
  });
  return html;
}
