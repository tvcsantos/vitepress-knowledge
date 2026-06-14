<script lang="ts" setup>
import { WELCOME_CHAT_MESSAGE } from "./utils/constants";
import MessageList from "./components/MessageList.vue";
import { computed, onMounted, ref, shallowRef, toRaw, watch } from "vue";
import type { AiModel, ChatMessage } from "../shared/types";
import { isIframe } from "./utils/is-iframe";
import useParentTheme from "./composables/useParentTheme";
import useMdToHtml from "./composables/useMdToHtml";

useParentTheme();

const SELECTED_MODEL_STORAGE_KEY = "vpk:selected-model";

// SITE_ID is injected by the server into index.html at serve time.
// In dev, if the backend wasn't ready when Vite first transformed the HTML,
// the value may be "unknown" - resolve it lazily from the API in that case.
let _resolvedSiteId: string | undefined;
async function getResolvedSiteId(): Promise<string> {
  if (_resolvedSiteId) return _resolvedSiteId;
  if (SITE_ID && SITE_ID !== "unknown" && !SITE_ID.startsWith("{{")) {
    _resolvedSiteId = SITE_ID;
    return _resolvedSiteId;
  }
  try {
    const res = await fetch(`${SERVER_URL}/api/sites/default`);
    if (res.ok) {
      const site = await res.json();
      _resolvedSiteId = site?.id;
    }
  } catch {}
  return _resolvedSiteId ?? SITE_ID;
}

const close = () => {
  window.postMessage("vitepress-knowledge:close-modal", "*");
  window.parent.postMessage("vitepress-knowledge:close-modal", "*");
};

const SESSION_MESSAGES_KEY = "vpk:messages";

const threadMessages = shallowRef<ChatMessage[]>(
  JSON.parse(sessionStorage.getItem(SESSION_MESSAGES_KEY) ?? "[]"),
);

watch(threadMessages, (msgs) => {
  sessionStorage.setItem(SESSION_MESSAGES_KEY, JSON.stringify(msgs));
});

const newMessage = ref("");
const loading = ref(false);
const error = ref<Error>();
const scrollContainer = ref<HTMLElement>();

watch(threadMessages, () => {
  if (scrollContainer.value)
    scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
});

const models = ref<AiModel[]>([]);
const selectedModel = ref<string>("");

onMounted(async () => {
  try {
    const res = await fetch(`${SERVER_URL}/api/models`);
    if (!res.ok)
      throw new Error(`Request failed: ${res.status} ${res.statusText}`);
    const fetchedModels: AiModel[] = await res.json();
    models.value = fetchedModels;
    const stored = localStorage.getItem(SELECTED_MODEL_STORAGE_KEY) ?? "";
    selectedModel.value =
      fetchedModels.find((m) => m.enum === stored)?.enum ??
      fetchedModels[0]?.enum ??
      "";
  } catch (err) {
    error.value = err instanceof Error ? err : new Error(String(err));
    console.error(err);
  }
});

watch(selectedModel, (value) => {
  if (value) localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, value);
});

const sendMessage = async () => {
  const content = newMessage.value.trim();
  if (!content || loading.value || !selectedModel.value) return;

  const oldThreadMessages: ChatMessage[] = toRaw(threadMessages.value);
  try {
    loading.value = true;
    error.value = undefined;
    newMessage.value = "";

    const userMessage: ChatMessage = { role: "user", content };
    const assistantMessage: ChatMessage = { role: "assistant", content: "" };
    const newThreadMessages: ChatMessage[] = [
      ...oldThreadMessages,
      userMessage,
    ];
    threadMessages.value = [...newThreadMessages];

    const res = await fetch(`${SERVER_URL}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId: await getResolvedSiteId(),
        messages: newThreadMessages,
        model: selectedModel.value,
      }),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Request failed: ${res.status} ${res.statusText}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = JSON.parse(line.slice(5).trim());
        if (typeof data === "string") {
          assistantMessage.content += data;
          threadMessages.value = [
            ...newThreadMessages,
            { ...assistantMessage },
          ];
        } else if (data.done) {
          threadMessages.value = data.messages;
        } else if (data.error) {
          throw new Error(data.error);
        }
      }
    }
  } catch (err) {
    error.value = err instanceof Error ? err : new Error(String(err));
    console.error(err);
    threadMessages.value = oldThreadMessages;
  } finally {
    loading.value = false;
  }
};

const hasNoModels = computed(
  () => models.value.length === 0 && !error.value && !loading.value,
);
const sendDisabled = computed(
  () => loading.value || !selectedModel.value || models.value.length === 0,
);

const messages = computed(() => {
  if (threadMessages.value.length === 0) return [WELCOME_CHAT_MESSAGE];
  return threadMessages.value;
});

const docsUrl = DOCS_URL;
const docsDomain = new URL(DOCS_URL).host;
const appName = APP_NAME;

const privacyPolicyMd = ref("");
const showPrivacyPolicy = ref(false);
const privacyPolicyHtml = useMdToHtml(privacyPolicyMd);

async function openPrivacyPolicy() {
  if (!privacyPolicyMd.value) {
    const res = await fetch(`${SERVER_URL}/privacy-policy`);
    if (res.ok) privacyPolicyMd.value = await res.text();
  }
  showPrivacyPolicy.value = true;
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div
      class="shrink-0 flex items-center gap-4 border-b border-current/20 p-3 pl-4"
    >
      <i class="i-heroicons-bolt-solid size-6" />
      <div class="flex gap-1 items-center">
        <h1 class="shrink-0 font-bold text-lg">Ask {{ appName }} AI</h1>
      </div>
      <div class="flex-1" />
      <a
        v-if="!isIframe"
        class="ml-4 link font-bold text-lg"
        :href="docsUrl"
        target="_blank"
      >
        <span>{{ docsDomain }}</span>
        <i
          class="i-heroicons-arrow-top-right-on-square-16-solid size-4 -my-2"
        />
      </a>

      <button
        class="btn btn-ghost btn-circle"
        title="New conversation"
        :disabled="threadMessages.length === 0"
        @click="threadMessages = []"
      >
        <i class="i-heroicons-pencil-square-solid size-5" />
      </button>

      <button
        v-if="isIframe"
        class="btn btn-ghost btn-circle"
        title="close"
        @click="close"
      >
        <i class="i-heroicons-x-mark-solid" />
      </button>
    </div>

    <div class="flex-1 relative">
      <div
        v-if="showPrivacyPolicy"
        class="absolute inset-0 overflow-y-auto p-4 prose prose-sm prose-invert max-w-none"
        v-html="privacyPolicyHtml"
      />
      <div
        v-else
        ref="scrollContainer"
        class="absolute inset-0 overflow-y-auto p-4"
      >
        <MessageList :messages show-top-links :loading />
      </div>
    </div>

    <div class="shrink-0 m-2 flex flex-col gap-2">
      <div
        v-if="error && !showPrivacyPolicy"
        class="bg-(--c-warning)/20 rounded p-4 flex gap-4"
      >
        <i class="text-(--c-warning) i-heroicons-exclaimation-triangle" />
        <p class="flex-1">
          {{ (error.cause as Error | undefined)?.message ?? error?.message }}
        </p>
      </div>
      <div
        v-if="hasNoModels && !showPrivacyPolicy"
        class="bg-(--c-warning)/20 rounded p-4 flex gap-4"
      >
        <i class="text-(--c-warning) i-heroicons-exclaimation-triangle" />
        <p class="flex-1">
          No AI models are configured. See the backend README for setup
          instructions.
        </p>
      </div>
      <form
        v-if="!showPrivacyPolicy"
        class="relative pr-0.5 bg-(--c-default-soft) ring-0 ring-(--c-brand) focus-within:ring-2 rounded transition"
        @submit.prevent="sendMessage"
      >
        <textarea
          class="w-full min-w-0 min-h-25 p-3 pr-14.5 leading-normal bg-transparent outline-none resize-y text-sm h-auto"
          placeholder="Ask a question..."
          v-model="newMessage"
          :disabled="loading"
          @keydown.ctrl.enter="sendMessage"
          @keydown.cmd.enter="sendMessage"
        />
        <div class="absolute left-2.5 bottom-2.5">
          <select
            v-if="models.length > 0"
            v-model="selectedModel"
            class="select select-sm bg-transparent outline-none text-xs opacity-70 hover:opacity-100 transition cursor-pointer"
            :disabled="loading"
            title="Select model"
          >
            <option
              v-for="model in models"
              :key="model.enum"
              :value="model.enum"
            >
              {{ model.name }}
            </option>
          </select>
        </div>
        <button
          class="btn btn-circle absolute right-2.5 top-3"
          type="submit"
          :disabled="sendDisabled"
        >
          <i class="i-heroicons-paper-airplane-solid size-5" />
        </button>
      </form>

      <div class="text-sm flex gap-1">
        <template v-if="showPrivacyPolicy">
          <button class="link" @click="showPrivacyPolicy = false">
            <i class="i-heroicons-arrow-left-16-solid size-4 -my-2" />
            <span>Back to chat</span>
          </button>
        </template>
        <template v-else>
          <p class="opacity-70">Powered by</p>
          <a
            class="link"
            href="https://github.com/tvcsantos/vitepress-knowledge"
            target="_blank"
          >
            <i class="i-heroicons-bolt-16-solid size-4 -my-2" />
            <span>vitepress-knowledge</span>
          </a>
          <div class="flex-1" />
          <button class="link" @click="openPrivacyPolicy">
            <span>Privacy Policy</span>
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
