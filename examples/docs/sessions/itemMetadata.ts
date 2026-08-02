import { Agent, run } from '@openai/agents';
import type { AgentInputItem, Session } from '@openai/agents-core';

/**
 * A session that uses application-owned item metadata to decide which stored
 * items the model sees and to tag items before persisting them.
 */
class MetadataAwareSession implements Session {
  private items: AgentInputItem[] = [];

  async getSessionId(): Promise<string> {
    return 'metadata-demo';
  }

  async getItems(limit?: number): Promise<AgentInputItem[]> {
    // Metadata is opaque to the SDK; the application decides what it means.
    const modelVisible = this.items.filter(
      (item) => item.metadata?.visibility !== 'client-only',
    );
    return limit === undefined ? modelVisible : modelVisible.slice(-limit);
  }

  async addItems(items: AgentInputItem[]): Promise<void> {
    this.items.push(
      ...items.map((item) =>
        'role' in item && item.role === 'assistant'
          ? { ...item, metadata: { ...item.metadata, source: 'agent' } }
          : item,
      ),
    );
  }

  async popItem(): Promise<AgentInputItem | undefined> {
    return this.items.pop();
  }

  async clearSession(): Promise<void> {
    this.items = [];
  }
}

const agent = new Agent({
  name: 'MetadataDemo',
  instructions: 'Answer briefly.',
});

const session = new MetadataAwareSession();

// Tag the input item; the tag reaches addItems() but is never sent to the model provider.
const result = await run(
  agent,
  [
    {
      type: 'message',
      role: 'user',
      content: 'Hello!',
      metadata: { kind: 'voice', channel: 'mobile-app' },
    },
  ],
  { session },
);
console.log(result.finalOutput);
