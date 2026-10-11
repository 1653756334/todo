import { ChannelsForm } from "@/components/settings/ChannelsForm";
import { requirePageSession } from "@/lib/workspace";
import { listChannels, readGroup, smtpConfig } from "@/server/settings/service";

export const dynamic = "force-dynamic";

export default async function EmailSettingsPage() {
  const user = await requirePageSession();
  const [channels, policy, smtp] = await Promise.all([
    listChannels(user), readGroup("policy"), smtpConfig().catch(() => null),
  ]);
  return (
    <ChannelsForm
      type="EMAIL"
      allowed={policy.value.emailAllowed}
      smtpReady={!!smtp}
      initial={channels.filter(channel => channel.type === "EMAIL").map(channel => ({
        ...channel, verifiedAt: channel.verifiedAt?.toISOString() ?? null,
      }))}
    />
  );
}
