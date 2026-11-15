/**
 * Claude, as the reasoning engine. Each business has its own API key (and so
 * its own Anthropic workspace, usage and billing). With no key the system runs
 * in rules-only mode: every deterministic agent and check still works, and
 * anything that needs prose says so instead of pretending.
 */
export function makeLlm(ctx) {
  const key = ctx.tenant.secret('apiKey');
  const model = ctx.tenant.cfg.model || 'claude-opus-5-5';
  let client = null;
  const constitution = () => ctx.tenant.cfg.constitution.join('\n');

  async function getClient() {
    if (client) return client;
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    client = { sdk: new Anthropic({ apiKey: key }), Anthropic };
    return client;
  }

  return {
    available: Boolean(key) && !ctx.offline,
    model,
    /**
     * One agent turn. `agent` is a registry entry; its instructions and the
     * business constitution form the (cached) system prompt.
     * Returns { text } or { json } — or null in rules-only mode.
     */
    async run(agent, prompt, { schema = null, effort = 'medium', knowledge = [] } = {}) {
      if (!this.available) return null;
      const { sdk, Anthropic } = await getClient();
      const system = [
        { type: 'text', text: `${constitution()}\n\n${ctx.registry.instructions(agent.id)}`, cache_control: { type: 'ephemeral' } },
      ];
      const kb = knowledge.length ? `Approved internal knowledge (the only business facts you may rely on):\n${knowledge.map((k) => `## ${k.title} [${k.path}, v${k.version}, ${k.status}]\n${k.body ?? k.excerpt}`).join('\n\n')}\n\n` : '';
      const params = {
        model, max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
        output_config: { effort, ...(schema ? { format: { type: 'json_schema', schema } } : {}) },
        system, messages: [{ role: 'user', content: kb + prompt }],
      };
      let res;
      try {
        res = await sdk.beta.messages.create(params);
      } catch (e) {
        if (e instanceof Anthropic.AuthenticationError) throw new Error(`Claude API key for ${ctx.tenant.cfg.name} was rejected`);
        if (e instanceof Anthropic.RateLimitError) throw new Error('Claude rate limit reached — retry the step shortly');
        if (e instanceof Anthropic.APIError) throw new Error(`Claude API error ${e.status}: ${e.message}`);
        throw e;
      }
      ctx.db.q('INSERT INTO usage(at,agent_id,model,input_tokens,output_tokens,cache_read) VALUES(?,?,?,?,?,?)')
        .run(ctx.db.now(), agent.id, res.model, res.usage.input_tokens, res.usage.output_tokens, res.usage.cache_read_input_tokens || 0);
      if (res.stop_reason === 'refusal') throw new Error(`Claude declined this request (${res.stop_details?.category || 'no category'})`);
      if (res.stop_reason === 'max_tokens') throw new Error('Claude response was cut off at the token limit');
      const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      return schema ? { json: JSON.parse(text) } : { text };
    },
  };
}
