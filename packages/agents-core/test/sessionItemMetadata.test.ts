import { describe, it, expect } from 'vitest';
import { Agent } from '../src/agent';
import { Runner } from '../src/run';
import { RunContext } from '../src/runContext';
import { RunState } from '../src/runState';
import type { Session } from '../src/memory/session';
import type { ModelRequest, ModelResponse } from '../src/model';
import type { AgentInputItem } from '../src/types';
import * as protocol from '../src/types/protocol';
import {
  FakeModel,
  fakeModelMessage,
  TEST_MODEL_RESPONSE_BASIC,
} from './stubs';

class RecordingSession implements Session {
  #history: AgentInputItem[];
  #added: AgentInputItem[][] = [];

  constructor(history: AgentInputItem[] = []) {
    this.#history = [...history];
  }

  get added(): AgentInputItem[][] {
    return this.#added;
  }

  async getSessionId(): Promise<string> {
    return 'conv_metadata_test';
  }

  async getItems(limit?: number): Promise<AgentInputItem[]> {
    if (limit == null) {
      return [...this.#history];
    }
    return this.#history.slice(-limit);
  }

  async addItems(items: AgentInputItem[]): Promise<void> {
    this.#added.push(items);
    this.#history.push(...items);
  }

  async popItem(): Promise<AgentInputItem | undefined> {
    return this.#history.pop();
  }

  async clearSession(): Promise<void> {
    this.#history = [];
  }
}

class RecordingModel extends FakeModel {
  lastRequest: ModelRequest | undefined;

  constructor(responses: ModelResponse[]) {
    super(responses);
  }

  override async getResponse(request: ModelRequest): Promise<ModelResponse> {
    this.lastRequest = request;
    return super.getResponse(request);
  }
}

const metadata = { kind: 'voice', visibility: 'client-only' };

describe('per-item metadata', () => {
  it('round-trips through the protocol item schemas', () => {
    const parsed = protocol.ModelItem.parse({
      type: 'message',
      role: 'user',
      content: 'hello',
      metadata,
    });
    expect(parsed.metadata).toEqual(metadata);

    const withoutMetadata = protocol.ModelItem.parse({
      type: 'message',
      role: 'user',
      content: 'hello',
    });
    expect(withoutMetadata.metadata).toBeUndefined();
  });

  it('persists caller-provided metadata into the session unchanged', async () => {
    const model = new RecordingModel([
      { ...TEST_MODEL_RESPONSE_BASIC, output: [fakeModelMessage('hi')] },
    ]);
    const agent = new Agent({ name: 'MetadataAgent', model });
    const session = new RecordingSession();

    await new Runner().run(
      agent,
      [{ type: 'message', role: 'user', content: 'hello', metadata }],
      { session },
    );

    expect(session.added).toHaveLength(1);
    expect(session.added[0][0]).toMatchObject({
      role: 'user',
      content: 'hello',
      metadata,
    });
    expect(session.added[0][1]).toMatchObject({ role: 'assistant' });
    expect(session.added[0][1].metadata).toBeUndefined();
  });

  it('passes stored metadata through history preparation without re-persisting it', async () => {
    const historyItem: AgentInputItem = {
      type: 'message',
      role: 'user',
      content: 'earlier',
      metadata,
    };
    const model = new RecordingModel([
      { ...TEST_MODEL_RESPONSE_BASIC, output: [fakeModelMessage('hi')] },
    ]);
    const agent = new Agent({ name: 'MetadataAgent', model });
    const session = new RecordingSession([historyItem]);

    await new Runner().run(agent, 'next turn', { session });

    const recordedInput = model.lastRequest?.input as AgentInputItem[];
    expect(recordedInput[0]).toMatchObject({
      role: 'user',
      content: 'earlier',
      metadata,
    });
    expect(session.added).toHaveLength(1);
    expect(session.added[0]).not.toContainEqual(
      expect.objectContaining({ content: 'earlier' }),
    );
  });

  it('survives RunState serialization and resume', async () => {
    const agent = new Agent({ name: 'MetadataAgent' });
    const state = new RunState(
      new RunContext(),
      [{ type: 'message', role: 'user', content: 'hello', metadata }],
      agent,
      3,
    );

    const restored = await RunState.fromString(agent, state.toString());
    expect(restored._originalInput).toEqual([
      { type: 'message', role: 'user', content: 'hello', metadata },
    ]);
  });
});
