import { z } from "zod";

/**
 * Validates the persisted Zulip channel config, both for the top-level account and
 * for any entries under channels.zulip.accounts.
 */
const MarkdownConfigSchema = z
  .object({
    tables: z.enum(["off", "bullets", "code"]).optional(),
  })
  .strict();

const DmPolicySchema = z.enum(["pairing", "allowlist", "open", "disabled"]);
const GroupPolicySchema = z.enum(["open", "disabled", "allowlist"]);
const BlockStreamingCoalesceSchema = z
  .object({
    minChars: z.number().int().positive().optional(),
    maxChars: z.number().int().positive().optional(),
    idleMs: z.number().int().positive().optional(),
  })
  .strict();

/** Enforces that an explicitly open DM policy also carries an explicit wildcard allowlist. */
function requireOpenAllowFrom(params: {
  policy: z.infer<typeof DmPolicySchema> | undefined;
  allowFrom: Array<string | number> | undefined;
  ctx: z.RefinementCtx;
  path: (string | number)[];
  message: string;
}): void {
  if (params.policy !== "open") {
    return;
  }
  const hasWildcard = (params.allowFrom ?? []).some((entry) => String(entry).trim() === "*");
  if (!hasWildcard) {
    params.ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: params.path,
      message: params.message,
    });
  }
}

/** Shared shape for a single resolved Zulip account configuration. */
const ZulipAccountSchemaBase = z
  .object({
    name: z.string().optional(),
    capabilities: z.array(z.string()).optional(),
    markdown: MarkdownConfigSchema.optional(),
    enabled: z.boolean().optional(),
    configWrites: z.boolean().optional(),
    url: z.string().optional(),
    site: z.string().optional(),
    realm: z.string().optional(),
    email: z.string().optional(),
    apiKey: z.string().optional(),
    streams: z.array(z.string()).optional(),
    defaultTopic: z.string().optional(),
    chatmode: z.enum(["oncall", "onmessage", "onchar"]).optional(),
    oncharPrefixes: z.array(z.string()).optional(),
    requireMention: z.boolean().optional(),
    dmPolicy: DmPolicySchema.optional(),
    allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
    groupAllowFrom: z.array(z.union([z.string(), z.number()])).optional(),
    groupPolicy: GroupPolicySchema.optional(),
    mediaMaxMb: z.number().int().positive().optional(),
    reactions: z
      .object({
        enabled: z.boolean().optional(),
        clearOnFinish: z.boolean().optional(),
        onStart: z.string().optional(),
        onSuccess: z.string().optional(),
        onError: z.string().optional(),
      })
      .optional(),
    textChunkLimit: z.number().int().positive().optional(),
    chunkMode: z.enum(["length", "newline"]).optional(),
    blockStreaming: z.boolean().optional(),
    blockStreamingCoalesce: BlockStreamingCoalesceSchema.optional(),
    responsePrefix: z.string().optional(),
    enableAdminActions: z.boolean().optional(),
  })
  .strict();

const ZulipAccountSchema = ZulipAccountSchemaBase.superRefine((value, ctx) => {
  requireOpenAllowFrom({
    policy: value.dmPolicy,
    allowFrom: value.allowFrom,
    ctx,
    path: ["allowFrom"],
    message: 'channels.zulip.dmPolicy="open" requires channels.zulip.allowFrom to include "*"',
  });
});

/** Full channel config, including optional multi-account configuration. */
export const ZulipConfigSchema = ZulipAccountSchemaBase.extend({
  accounts: z.record(z.string(), ZulipAccountSchema.optional()).optional(),
  defaultAccount: z.string().optional(),
}).superRefine((value, ctx) => {
  requireOpenAllowFrom({
    policy: value.dmPolicy,
    allowFrom: value.allowFrom,
    ctx,
    path: ["allowFrom"],
    message: 'channels.zulip.dmPolicy="open" requires channels.zulip.allowFrom to include "*"',
  });
});
