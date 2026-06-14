<script setup lang="ts">
import { computed } from "vue";
import type { ChatMessage } from "../../shared/types";
import MessageListItem from "./MessageListItem.vue";

const props = defineProps<{
  messages: ChatMessage[];
  loading?: boolean;
}>();

// Show spinner only while waiting for the first token — once the assistant
// bubble has content the spinner should disappear.
const showSpinner = computed(() => {
  if (!props.loading) return false;
  const last = props.messages.at(-1);
  return !last || last.role !== "assistant" || last.content === "";
});
</script>

<template>
  <ul class="flex flex-col gap-4">
    <MessageListItem v-for="message of messages" :message />

    <li v-if="showSpinner">
      <i class="i-svg-spinners-3-dots-bounce" />
    </li>
  </ul>
</template>
