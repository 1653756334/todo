import { ChannelsForm } from "@/components/settings/ChannelsForm";
import { requirePageSession } from "@/lib/workspace";
import { listChannels, readGroup } from "@/server/settings/service";

export const dynamic = "force-dynamic";

export default async function PushSettingsPage() {
  const user = await requirePageSession();
  const [channels, policy] = await Promise.all([listChannels(user), readGroup("policy")]);
  return (
    <ChannelsForm
      type="WEBHOOK"
      allowed={policy.value.webhookAllowed}
      smtpReady={false}
      initial={channels.filter(channel => channel.type === "WEBHOOK").map(channel => ({
        ...channel, verifiedAt: channel.verifiedAt?.toISOString() ?? null,
      }))}
    />
  );
}
