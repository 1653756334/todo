import { ContentTransition } from "@/components/Motion";
import { GeneralSettingsForm } from "@/components/settings/GeneralSettingsForm";
import { ReminderServiceStatus } from "@/components/settings/ReminderServiceStatus";
import { preference } from "@/server/settings/service";
import { requirePageSession } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function GeneralSettingsPage() {
  const user = await requirePageSession();
  const defaults = await preference(user);

  return (
    <ContentTransition stateKey="general-settings" className="space-y-5">
      <GeneralSettingsForm
        initialTimeZone={user.timezone}
        initialDefaultEnabled={defaults.remindEnabled}
        initialDefaultLeadMin={defaults.remindLeadMin}
      />
      <section className="settings-card">
        <h2 className="section-title">提醒服务</h2>
        <p className="section-description mt-1">
          检查提醒服务是否可用。通知能否送达，还取决于个人渠道配置和任务的提醒设置。
        </p>
        <ReminderServiceStatus />
      </section>
    </ContentTransition>
  );
}
