export type ServerId = 'vault' | 'juiceapi';

export interface Track {
  /** Which server this record came from. Part of the identity key. */
  serverId: ServerId;

  /** Provider-scoped identifier, prefixed with serverId.
   *  Examples: "vault:12345" or "juiceapi:94316" */
  trackId: string;

  /** The provider's own raw identifier, before prefixing.
   *  Vault: string form of its numeric id.
   *  JuiceWRLDAPI: string form of its integer id. */
  providerTrackId: string;

  title: string;
  author: string;

  /** Parsed duration in seconds, or null if the record had no usable length. */
  durationSeconds: number | null;

  /** Fully resolved, absolute artwork URL. Null if none available. */
  imageUrl: string | null;

  /** Fully resolved, absolute audio URL ready to assign to <audio src>.
   *  NULL means the record exists in the catalog but has no playable audio
   *  (e.g. an empty `path` on juicewrldapi.com). UI must render it as
   *  disabled/unavailable. */
  audioUrl: string | null;

  /** Category value as the provider uses it. Do not translate.
   *  Vault: "unreleased" | "stem" | "studio-sessions" | "released" |
   *         "remasters" | "miscellaneous"
   *  JuiceWRLDAPI: "released" | "unreleased" | "unsurfaced" |
   *                "recording_session" */
  category: string;

  /** Optional subcategory (Vault has these, JuiceWRLDAPI generally does not). */
  subcategory?: string;

  /** Era name, not numeric id. Optional. */
  era?: string;

  /** The unmodified provider record. For debugging and for fields we do not
   *  yet surface. Never rendered directly. */
  raw: unknown;
}
