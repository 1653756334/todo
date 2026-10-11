import { SettingsNav } from "@/components/settings/SettingsNav";
import { SettingsShell } from "@/components/settings/SettingsShell";

export const dynamic = "force-dynamic";

/**
 * 这里的 layout 必须保持同步渲染。
 *
 * 它以前会 await requirePageSession()，于是在从别的分区第一次进入设置页时，
 * 整个设置区（标题 + 分类导航）都会被上层的骨架屏顶掉，等内容就绪后再补回来，
 * 看起来就是「先出来一张卡片、再往上跳一下」。会话校验并没有因此变松：
 * - src/proxy.ts 的中间件对所有非公开路径做签名与过期校验；
 * - 每个设置页自己在取数据前都会 await requirePageSession()。
 */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SettingsShell
      title="设置"
      description="管理任务偏好、通知、项目和账户访问。"
      nav={<SettingsNav />}
    >
      {children}
    </SettingsShell>
  );
}
