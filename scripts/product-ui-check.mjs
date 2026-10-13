/**
 * 产品交互验收：创建临时账号和数据，并在结束后清理。
 * 不修改现有用户、站点配置，也不发送邮件、Webhook 或 AI 请求。
 * CHECK_BASE 必须与待测实例的 APP_URL 相同（默认 http://localhost:23330）。
 * CHECK_BASE=http://localhost:23330 node --env-file=.env scripts/product-ui-check.mjs
 * 截图与结果保存到 .run/ui-artifacts/。
 */
import { chromium } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { hashPassword, signSession } from '../src/server/auth/crypto.mjs';
import { mkdir, writeFile } from 'node:fs/promises';

const db = new PrismaClient();
const base = process.env.CHECK_BASE ?? 'http://localhost:23330';
const prefix = `ui${randomUUID().replaceAll('-', '').slice(0, 10)}`;
const userIds = [];
const targets = [];
const results = [];
const errors = [];
const password = `Ui-check-${randomUUID()}`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(message.text()); });
page.setDefaultTimeout(12000);
page.setDefaultNavigationTimeout(60000);
async function check(name, run) {
  try { await run(); results.push({name, pass:true}); console.log(`PASS ${name}`); }
  catch (error) { results.push({name, pass:false, error:error.message}); console.log(`FAIL ${name}: ${error.message}`); await page.screenshot({path: `.run/ui-artifacts/failure-${results.length}.png`, fullPage:true}).catch(()=>{}); }
}
/** 等数据库里的变化落盘，避免依赖固定等待时间 */
async function waitForDb(probe, message, timeout = 8000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await probe()) return;
    if (Date.now() > deadline) throw Error(message);
    await page.waitForTimeout(150);
  }
}
/** 某时区的墙上时间，用于填 datetime-local */
function localInputValue(date, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false}).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
async function open(path) {
  await page.goto(`${base}${path}`, {waitUntil:'load'});
  await page.locator('h1').first().waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => Object.keys(button).some(key => key.startsWith('__reactProps'))));
  await page.waitForTimeout(500);
}
async function signIn(user) {
  await context.clearCookies();
  const current = await db.user.findUniqueOrThrow({where:{id:user.id}});
  await context.addCookies([{name:'todo_session',value:signSession({userId:current.id, version:current.sessionVersion},process.env.APP_SECRET),url:base,httpOnly:true,sameSite:'Lax'}]);
}
try {
  await mkdir('.run/ui-artifacts', {recursive:true});
  for (const [suffix, role, displayName] of [['admin','ADMIN','验收管理员'],['user','USER','验收用户'],['other','USER','受邀同事']]) {
    const user = await db.user.create({data:{username:`${prefix}${suffix}`,displayName,role,passwordHash:hashPassword(password),preference:{create:{}}}});
    userIds.push(user.id);
  }
  const admin = await db.user.findUniqueOrThrow({where:{id:userIds[0]}});
  const user = await db.user.findUniqueOrThrow({where:{id:userIds[1]}});
  const other = await db.user.findUniqueOrThrow({where:{id:userIds[2]}});
  const project = await db.project.create({data:{ownerId:admin.id,name:'设计验收项目',color:'#1D4ED8'}});
  targets.push(project.id);
  const task = await db.task.create({data:{ownerId:admin.id,projectId:project.id,title:'检查产品交互',remindEnabled:false}});
  targets.push(task.id, ...userIds);
  await check('登录必填与用户名焦点', async()=>{
    await open('/login');
    await page.getByRole('button',{name:'登录',exact:true}).click();
    await page.getByText('请输入用户名',{exact:true}).waitFor();
    if (!(await page.locator('#login-error').innerText()).includes('用户名')) throw Error('缺少用户名提示');
    if (!(await page.locator('input[name="username"]').evaluate(el=>el===document.activeElement))) throw Error('焦点未到用户名');
  });
  await check('真实账号登录',async()=>{
    await page.locator('input[name="username"]').fill(admin.username);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole('button',{name:'登录',exact:true}).click();
    await page.waitForURL(url=>url.pathname==='/today');
  });
  await signIn(admin);
  for (const [path,name] of [['/today','今天'],['/inbox','收件箱'],['/tasks','全部任务'],['/completed','已完成'],[`/projects/${project.id}`,'项目任务'],['/settings/general','通用设置'],['/settings/email','邮件设置'],['/settings/push','Webhook 设置'],['/settings/ai','AI 使用'],['/settings/projects','项目管理'],['/settings','账号与数据'],['/admin?tab=users','用户管理'],['/admin?tab=policy','注册与通知'],['/admin?tab=smtp','邮件服务'],['/admin?tab=ai','AI 服务']]) {
    await check(`桌面页面 ${name}`,async()=>{
      await open(path);
      if ((await page.locator('body').innerText()).includes('Application error')) throw Error('页面异常');
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
      if(overflow>1) throw Error(`横向溢出 ${overflow}px`);
    });
  }
  await check('管理员分类与 AI 表单切换',async()=>{
    await open('/admin?tab=ai');
    if(await page.locator('#admin-ai-baseUrl').count()!==1)throw Error('AI 字段未显示');
    await page.getByRole('link',{name:'邮件服务',exact:true}).click();
    await page.locator('#admin-smtp-host').waitFor();
    if(await page.locator('#admin-ai-baseUrl').count())throw Error('分类残留');
    await page.screenshot({path:'.run/ui-artifacts/admin-desktop.png',fullPage:true});
  });
  await check('用户编辑明确保存并更新额度',async()=>{
    await open('/admin?tab=users');
    const row=page.getByRole('article').filter({hasText:other.username});
    await row.getByRole('button',{name:'编辑权限与额度'}).click();
    const dialog=page.getByRole('dialog');
    await dialog.getByRole('combobox',{name:'AI 额度设置方式'}).click();
    await page.getByRole('option',{name:'单独设置',exact:true}).click();
    await page.locator('#admin-user-quota').fill('7');
    if((await db.user.findUnique({where:{id:other.id}})).aiDailyQuotaOverride!==null)throw Error('未保存就已写入');
    await dialog.getByRole('button',{name:'保存修改',exact:true}).click();
    await dialog.waitFor({state:'hidden'});
    if((await db.user.findUnique({where:{id:other.id}})).aiDailyQuotaOverride!==7)throw Error('额度未保存');
  });
  await check('Webhook 添加校验、保存与编辑保留地址',async()=>{
    await open('/settings/push');
    await page.getByRole('button',{name:'添加 Webhook',exact:true}).click();
    await page.getByRole('button',{name:'保存渠道',exact:true}).click();
    await page.getByText('请填写机器人的完整 Webhook 地址。',{exact:true}).waitFor();
    await page.locator('#channel-webhook-label').fill('验收机器人');
    await page.locator('#channel-webhook-webhook').fill('https://example.com/webhook/test');
    const enabled=page.getByRole('switch',{name:'启用自动任务提醒'});
    if(await enabled.getAttribute('aria-checked')==='true')await enabled.click();
    await page.screenshot({path:'.run/ui-artifacts/webhook-dialog-desktop.png',fullPage:true});
    await page.getByRole('button',{name:'保存渠道',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    const channel=await db.notificationChannel.findFirstOrThrow({where:{ownerId:admin.id,label:'验收机器人'}});
    targets.push(channel.id);
    const row=page.getByRole('article',{name:'验收机器人'});
    await row.getByRole('button',{name:'编辑',exact:true}).click();
    if(await page.locator('#channel-webhook-webhook').count())throw Error('已保存地址不应回显');
    await page.locator('#channel-webhook-label').fill('验收机器人改名');
    await page.getByRole('button',{name:'保存渠道',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    const updated=await db.notificationChannel.findUniqueOrThrow({where:{id:channel.id}});
    if(updated.webhookEncrypted!==channel.webhookEncrypted)throw Error('编辑时地址丢失');
  });
  await check('邮件单渠道限制',async()=>{
    await open('/settings/email');
    await page.getByRole('button',{name:'添加邮箱',exact:true}).click();
    await page.locator('#channel-email-email').fill(`${prefix}@example.com`);
    const enabled=page.getByRole('switch',{name:'启用自动任务提醒'});
    if(await enabled.getAttribute('aria-checked')==='true')await enabled.click();
    await page.getByRole('button',{name:'保存渠道',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    if(await page.getByRole('button',{name:'添加邮箱',exact:true}).count())throw Error('已配置邮箱仍显示添加按钮');
  });
  await check('项目添加、取消修改和编辑保存',async()=>{
    await open('/settings/projects');
    await page.getByRole('button',{name:'添加项目',exact:true}).click();
    await page.locator('#project-name').fill('新增验收项目');
    await page.getByRole('button',{name:'创建项目',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    const added=await db.project.findFirstOrThrow({where:{ownerId:admin.id,name:'新增验收项目'}});
    targets.push(added.id);
    await page.getByRole('button',{name:'编辑项目：新增验收项目',exact:true}).click();
    await page.locator('#project-name').fill('尚未保存');
    await page.getByRole('dialog').getByRole('button',{name:'取消',exact:true}).click();
    await page.getByRole('alertdialog').getByRole('button',{name:'放弃修改',exact:true}).click();
    if((await db.project.findUniqueOrThrow({where:{id:added.id}})).name!=='新增验收项目')throw Error('取消后数据变动');
  });
  await check('新建任务草稿关闭确认与创建',async()=>{
    await open('/inbox');
    await page.getByRole('button',{name:'新建任务',exact:true}).first().click();
    await page.locator('#task-title').fill('验收新建任务');
    await page.getByRole('dialog').getByRole('button',{name:'取消',exact:true}).click();
    await page.getByRole('alertdialog').getByRole('button',{name:'取消',exact:true}).click();
    await page.getByRole('button',{name:'创建任务',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    const added=await db.task.findFirstOrThrow({where:{ownerId:admin.id,title:'验收新建任务'}});
    targets.push(added.id);
  });
  await check('账号资料保存后按钮与显示名称更新',async()=>{
    await open('/settings');
    await page.locator('input[name="displayName"]').fill('验收管理员更新');
    await page.getByRole('button',{name:'保存资料',exact:true}).click();
    await page.getByText('账号资料已保存。',{exact:true}).first().waitFor();
    if(!(await page.getByRole('button',{name:'保存资料',exact:true}).isDisabled()))throw Error('保存后未重置 dirty');
  });
  await check('Webhook 删除等待确认',async()=>{
    await open('/settings/push');
    const row=page.getByRole('article',{name:'验收机器人改名'});
    await row.getByRole('button',{name:'删除',exact:true}).click();
    const confirm=page.getByRole('alertdialog').getByRole('button',{name:'删除渠道',exact:true});
    // 破坏性主操作必须是实心危险色，不能和普通主按钮长一样。
    const danger=await confirm.evaluate(el=>getComputedStyle(el).backgroundColor);
    if(danger!=='rgb(180, 35, 24)')throw Error(`删除按钮不是实心危险色：${danger}`);
    await confirm.click();
    await page.getByRole('alertdialog').waitFor({state:'hidden'});
    if(await db.notificationChannel.count({where:{ownerId:admin.id,type:'WEBHOOK'}}))throw Error('渠道未删除');
  });
  await check('任务自动保存与失败后保留草稿',async()=>{
    await open('/tasks');
    await page.getByRole('button',{name:'打开「检查产品交互」',exact:true}).click();
    await page.locator('#detail-title').fill('检查产品交互已保存');
    await page.getByRole('button',{name:'关闭详情',exact:true}).click();
    await page.locator('#detail-title').waitFor({state:'hidden'});
    if((await db.task.findUniqueOrThrow({where:{id:task.id}})).title!=='检查产品交互已保存')throw Error('离开前未保存');
    await page.getByRole('button',{name:'打开「检查产品交互已保存」',exact:true}).click();
    await page.route(`**/api/tasks/${task.id}`,async route=>{
      if(route.request().method()==='PATCH')await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'验收：暂时无法保存'})});
      else await route.continue();
    });
    await page.locator('#detail-title').fill('网络失败时的草稿');
    await page.getByRole('button',{name:'关闭详情',exact:true}).click();
    await page.getByRole('alertdialog').getByRole('button',{name:'取消',exact:true}).click();
    if(await page.locator('#detail-title').inputValue()!=='网络失败时的草稿')throw Error('保存失败丢失输入');
    await page.unroute(`**/api/tasks/${task.id}`);
    await page.getByRole('button',{name:'重试保存',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#detail-title')?.value==='网络失败时的草稿'&&!document.querySelector('.error-text[role="alert"]'));
    await page.getByRole('button',{name:'关闭详情',exact:true}).click();
    await page.locator('#detail-title').waitFor({state:'hidden'});
    if((await db.task.findUniqueOrThrow({where:{id:task.id}})).title!=='网络失败时的草稿')throw Error('重试未保存');
  });
  await check('时间段：区间显示、两条提醒与顺序校验',async()=>{
    const now=Date.now();
    const ongoing=await db.task.create({data:{ownerId:admin.id,title:'区间验收进行中',startAt:new Date(now-3600000),dueAt:new Date(now+3600000),remindStartLeadMin:15}});
    targets.push(ongoing.id);
    await open('/tasks');
    const row=page.locator(`[data-task-row="${ongoing.id}"]`);
    await row.waitFor();
    const rowText=(await row.innerText()).replace(/\s+/g,'');
    if(!rowText.includes('–'))throw Error('列表没有显示时间区间');
    if(!rowText.includes('进行中'))throw Error('区间内没有显示进行中');
    if((await db.task.findUniqueOrThrow({where:{id:ongoing.id}})).status!=='todo')throw Error('进行中不该改写任务状态');

    await page.getByRole('button',{name:'打开「区间验收进行中」',exact:true}).click();
    await page.locator('#detail-start-lead').waitFor();
    if(!(await page.locator('#detail-lead').count()))throw Error('区间任务应同时有开始与截止两条提醒');
    if(await page.getByPlaceholder('输入时间，如明天 18:00').count())throw Error('文字输入时间应已移除');

    // 结束时间挪到明天 → 仍然是合法区间
    const tz=admin.timezone;
    const startLocal=localInputValue(new Date(now+36*3600000),tz);
    const endLocal=localInputValue(new Date(now+38*3600000),tz);
    await page.getByLabel('结束日期和时间').fill(endLocal);
    await waitForDb(async()=>{const t=await db.task.findUniqueOrThrow({where:{id:ongoing.id}});return !!t.startAt&&t.dueAt>new Date(now+3600000);},'新的结束时间没有保存');

    // 开始时间晚于结束时间 → 给出提示且不保存
    await page.getByLabel('开始日期和时间').fill(endLocal);
    await page.getByText('开始时间要早于结束时间').first().waitFor();
    const afterInvalid=await db.task.findUniqueOrThrow({where:{id:ongoing.id}});
    if(!(afterInvalid.startAt&&afterInvalid.startAt.getTime()<now))throw Error('开始时间晚于结束时间时不该保存');

    // 改成合法区间 → 保存；再清除开始时间 → 回到单点且截止时间保留
    await page.getByLabel('开始日期和时间').fill(startLocal);
    await waitForDb(async()=>(await db.task.findUniqueOrThrow({where:{id:ongoing.id}})).startAt>new Date(now+3600000),'区间开始时间没有保存');
    await page.getByRole('button',{name:'清除开始时间',exact:true}).click();
    await waitForDb(async()=>(await db.task.findUniqueOrThrow({where:{id:ongoing.id}})).startAt===null,'清除开始时间没有保存');
    const single=await db.task.findUniqueOrThrow({where:{id:ongoing.id}});
    if(!single.dueAt)throw Error('清除开始时间不该影响截止时间');
  });
  await check('分页后编辑保留已加载任务',async()=>{
    await db.task.createMany({data:Array.from({length:54},(_,index)=>({id:`${prefix}-page-${index}`,ownerId:admin.id,title:`分页验收任务 ${index}`,remindEnabled:false,createdAt:new Date(Date.now()-index*1000)}))});
    targets.push(...Array.from({length:54},(_,index)=>`${prefix}-page-${index}`));
    await open('/tasks');
    await page.getByRole('button',{name:'加载更多任务',exact:true}).click();
    await page.getByRole('button',{name:'加载更多任务',exact:true}).waitFor({state:'hidden'});
    const before=await page.locator('[data-task-row]').count();
    if(before<55)throw Error('分页数据未加载');
    await page.getByRole('button',{name:'打开「分页验收任务 53」',exact:true}).click();
    await page.locator('#detail-title').fill('分页末尾任务已修改');
    await page.getByRole('button',{name:'关闭详情',exact:true}).click();
    await page.locator('#detail-title').waitFor({state:'hidden'});
    if(await page.locator('[data-task-row]').count()!==before)throw Error('编辑后丢失已加载任务');
  });
  await check('批量移动明确选择目标项目',async()=>{
    await open('/inbox');
    await page.getByRole('button',{name:'批量选择',exact:true}).click();
    await page.getByRole('checkbox',{name:'选择「分页验收任务 0」',exact:true}).check();
    await page.getByRole('checkbox',{name:'选择「分页验收任务 1」',exact:true}).check();
    await page.getByRole('combobox',{name:'移动到',exact:true}).selectOption(project.id);
    await page.getByRole('button',{name:'移动',exact:true}).click();
    await page.getByRole('button',{name:'批量选择',exact:true}).waitFor();
    if(await db.task.count({where:{id:{in:[`${prefix}-page-0`,`${prefix}-page-1`]},projectId:project.id}})!==2)throw Error('移动未完成');
  });
  await check('Webhook 保存失败可原样重试',async()=>{
    await open('/settings/push');
    await page.getByRole('button',{name:'添加 Webhook',exact:true}).click();
    await page.locator('#channel-webhook-label').fill('失败保留验收');
    await page.locator('#channel-webhook-webhook').fill('https://example.com/webhook/retry');
    const enabled=page.getByRole('switch',{name:'启用自动任务提醒'});
    if(await enabled.getAttribute('aria-checked')==='true')await enabled.click();
    await page.route('**/api/settings/channels',async route=>{
      if(route.request().method()==='PUT')await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'验收：暂时无法保存渠道'})});
      else await route.continue();
    });
    await page.getByRole('button',{name:'保存渠道',exact:true}).click();
    await page.getByText('验收：暂时无法保存渠道',{exact:true}).waitFor();
    if(await page.locator('#channel-webhook-webhook').inputValue()!=='https://example.com/webhook/retry')throw Error('错误后地址丢失');
    await page.unroute('**/api/settings/channels');
    await page.getByRole('button',{name:'保存渠道',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    const channel=await db.notificationChannel.findFirstOrThrow({where:{ownerId:admin.id,label:'失败保留验收'}});
    targets.push(channel.id);
  });
  await check('设置布局密度与控件规范',async()=>{
    await open('/settings/general');
    const nav=await page.locator('nav[aria-label="设置分类"]');
    const items=await nav.locator('a').evaluateAll(list=>list.map(el=>{const r=el.getBoundingClientRect();return {left:Math.round(r.left),top:Math.round(r.top)};}));
    if(items.length<6)throw Error('分类项缺失');
    if(new Set(items.map(item=>item.left)).size!==1)throw Error('桌面端分类没有竖向排列');
    const columns=await page.evaluate(()=>{
      const nav=document.querySelector('nav[aria-label="设置分类"]');
      const card=document.querySelector('.settings-card');
      return {navRight:Math.round(nav.getBoundingClientRect().right),cardLeft:Math.round(card.getBoundingClientRect().left)};
    });
    if(columns.cardLeft<=columns.navRight)throw Error('导航与内容没有并排');
    // 选择型控件不能用实心主色冒充按钮：选中项只靠浅底 + 主色文字区分。
    const segment=page.locator('.segment[aria-pressed="true"]');
    if(await segment.count()!==1)throw Error('外观分段控件没有唯一选中项');
    const segmentBg=await segment.evaluate(el=>getComputedStyle(el).backgroundColor);
    if(segmentBg==='rgb(37, 99, 235)')throw Error('选中项仍是实心主色');
    const saveBg=await page.getByRole('button',{name:'保存更改',exact:true}).evaluate(el=>getComputedStyle(el).backgroundColor);
    if(saveBg!=='rgb(37, 99, 235)')throw Error('保存按钮失去主色');
    const height=await page.evaluate(()=>[...document.querySelectorAll('.settings-card')].reduce((total,card)=>total+card.getBoundingClientRect().height,0));
    if(height>1000)throw Error(`通用设置卡片过高：${Math.round(height)}px`);
    const overflows=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    if(overflows>1)throw Error('设置页横向溢出');
    await page.screenshot({path:'.run/ui-artifacts/settings-density.png',fullPage:true});
  });
  await check('启用状态用绿色药丸表达',async()=>{
    await open('/admin?tab=users');
    const pill=page.locator('.status-pill.is-ok').first();
    if(await pill.count()===0)throw Error('没有成功状态药丸');
    const color=await pill.evaluate(el=>getComputedStyle(el).color);
    if(color!=='rgb(25, 115, 75)')throw Error(`成功状态不是绿色：${color}`);
  });
  await check('弹窗进出场有动画过渡',async()=>{
    await open('/settings/projects');
    await page.getByRole('button',{name:'添加项目',exact:true}).click();
    const panel=page.locator('.dialog-panel');
    await panel.waitFor();
    const enter=await panel.evaluate(el=>getComputedStyle(el).animationName);
    if(!enter.includes('panel-in'))throw Error(`弹窗入场没有动画：${enter}`);
    const overlay=await page.locator('.dialog-overlay').first().evaluate(el=>getComputedStyle(el).animationName);
    if(!overlay.includes('overlay-in'))throw Error(`遮罩入场没有动画：${overlay}`);
    await page.getByRole('button',{name:'取消',exact:true}).click();
    await page.waitForFunction(()=>{const el=document.querySelector('.dialog-panel');return !el||getComputedStyle(el).animationName.includes('panel-out');},{timeout:3000});
    await panel.waitFor({state:'detached'});
  });
  await check('确认弹窗同样有进场动画',async()=>{
    await open('/settings/projects');
    await page.getByRole('button',{name:/归档项目：/}).first().click();
    const panel=page.locator('.dialog-panel');
    await panel.waitFor();
    const enter=await panel.evaluate(el=>getComputedStyle(el).animationName);
    if(!enter.includes('panel-in'))throw Error(`确认弹窗没有动画：${enter}`);
    await page.getByRole('button',{name:'取消',exact:true}).click();
    await panel.waitFor({state:'detached'});
  });
  await check('折叠区域用高度动画而不是原生 details',async()=>{
    await open('/settings/push');
    await page.getByRole('button',{name:'添加 Webhook',exact:true}).click();
    const toggle=page.getByRole('button',{name:/加签设置/});
    if(await toggle.getAttribute('aria-expanded')!=='false')throw Error('折叠区默认应当是收起的');
    if(await page.locator('details').count())throw Error('仍在用原生 details');
    await toggle.click();
    const regionId=await toggle.getAttribute('aria-controls');
    if(!regionId)throw Error('折叠区缺少 aria-controls');
    const region=page.locator(`[id="${regionId}"]`);
    await region.waitFor();
    if(await toggle.getAttribute('aria-expanded')!=='true')throw Error('折叠状态没有更新');
    const wrapper=region.locator('xpath=..');
    if(await wrapper.evaluate(el=>getComputedStyle(el).overflowY)!=='hidden')throw Error('折叠容器未启用高度动画');
    if(await wrapper.evaluate(el=>el.hasAttribute('data-collapse'))!==true)throw Error('折叠区不是动画组件');
    await page.getByRole('button',{name:'取消',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
  });
  await check('时区使用统一下拉框且只列常用值',async()=>{
    await open('/settings/general');
    const trigger=page.locator('#setting-timezone');
    if(await trigger.evaluate(el=>el.tagName)!=='BUTTON')throw Error('时区不是项目下拉框');
    if(await page.locator('select#setting-timezone').count())throw Error('仍是原生 select');
    await trigger.click();
    const options=page.getByRole('option');
    await options.first().waitFor();
    const count=await options.count();
    if(count<5||count>15)throw Error(`时区选项数量不合适：${count}`);
    const labels=await options.allInnerTexts();
    if(labels.some(label=>!label.trim()))throw Error('时区选项缺少文字');
    await page.keyboard.press('Escape');
    await page.locator('[role="listbox"]').waitFor({state:'detached'});
  });
  await page.setViewportSize({width:390,height:844});
  for(const path of ['/today','/tasks','/settings/general','/settings/push','/settings/projects','/settings','/admin?tab=users','/admin?tab=smtp','/account']) {
    await check(`手机页面 ${path}`,async()=>{await open(path);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);if(overflow>1)throw Error(`横向溢出 ${overflow}px`);});
  }
  await check('手机 Webhook 弹窗可达保存按钮',async()=>{
    await open('/settings/push');
    await page.getByRole('button',{name:'添加 Webhook',exact:true}).click();
    const box=await page.getByRole('button',{name:'保存渠道',exact:true}).boundingBox();
    if(!box||box.y+box.height>844||box.x<0||box.x+box.width>390)throw Error('保存按钮超出屏幕');
    await page.screenshot({path:'.run/ui-artifacts/webhook-dialog-mobile.png',fullPage:true});
    await page.getByRole('button',{name:'取消',exact:true}).click();
  });
  await check('手机导航焦点和后台入口',async()=>{
    await page.getByRole('button',{name:'打开导航',exact:true}).click();
    await page.getByRole('dialog',{name:'工作空间导航'}).getByRole('link',{name:'站点管理',exact:true}).click();
    await page.getByRole('heading',{name:'站点管理',exact:true}).waitFor();
    if(await page.getByRole('dialog',{name:'工作空间导航'}).count())throw Error('导航未关闭');
    await page.screenshot({path:'.run/ui-artifacts/admin-mobile.png',fullPage:true});
  });
  await signIn(user);
  await check('普通用户无后台入口且访问被拦截',async()=>{
    await open('/settings/general');
    if(await page.getByRole('link',{name:'站点管理',exact:true}).count())throw Error('暴露后台入口');
    await open('/admin');
    if(new URL(page.url()).pathname==='/admin')throw Error('后台访问未阻止');
  });
  await check('浏览器无运行时错误',async()=>{if(errors.length)throw Error([...new Set(errors)].join(' | '));});
} finally {
  await browser.close();
  await db.task.deleteMany({where:{ownerId:{in:userIds}}});
  await db.project.deleteMany({where:{ownerId:{in:userIds}}});
  await db.auditLog.deleteMany({where:{OR:[{actorId:{in:userIds}},{targetId:{in:targets}}]}});
  await db.jobOutbox.deleteMany({where:{targetId:{in:targets}}});
  await db.loginAttempt.deleteMany({where:{username:{startsWith:prefix}}});
  await db.user.deleteMany({where:{id:{in:userIds}}});
  await db.$disconnect();
  await writeFile('.run/ui-artifacts/results.json',JSON.stringify(results,null,2));
  console.log(`${results.filter(result=>result.pass).length}/${results.length} passed`);
  process.exitCode=results.some(result=>!result.pass)?1:0;
}
