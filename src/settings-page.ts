/**
 * The settings pages: claiming a new server, the first-run setup steps, and
 * Settings afterwards.
 *
 * Rendered as a shell with the field catalog and the words for the chosen
 * language embedded as JSON; the script fetches the current values from
 * /api/admin/state and draws the forms. It uses the mail view's stylesheet
 * and tokens, so the two read as one product in either theme.
 */
import { escapeHtml } from './html.js';
import { PROVIDER_PRESETS } from './config.js';
import { SECTION_TITLES, SETTING_FIELDS, words, type SectionId } from './settings-catalog.js';
import { ADMIN_PASSWORD_MIN } from './services/settings-store.js';
import { storeLanguageScript } from './web-client.js';
import { LIGHT_BAR, styles } from './web-styles.js';
import type { Insights } from './services/state.js';
import type { Language } from './web-strings.js';

type Dict = Record<string, string>;

const EN: Dict = {
  'claim.title': 'Set up mailsift',
  'claim.intro': 'Enter the one-time setup code from the service log, then choose the username and password you will sign in with.',
  'claim.code': 'Setup code',
  'claim.username': 'Username',
  'claim.password': 'Administrator password',
  'claim.confirm': 'Repeat the password',
  'claim.submit': 'Continue',
  'claim.mismatch': 'The two passwords differ.',
  'claim.short': 'Use at least {n} characters.',
  'claim.where': 'Where is the code?',
  'claim.whereBody': 'mailsift prints it when it starts. With Docker Compose: docker compose logs mailsift. Restarting prints a new one: docker compose restart mailsift.',
  'nav.settings': 'Settings',
  'nav.setup': 'Setup',
  'nav.back': 'Back to mail',
  'nav.signout': 'Sign out',
  'nav.users': 'Users',
  'nav.sync': 'Sync',
  'nav.documents': 'Documents',
  'docs.title': 'Documents & bills',
  'docs.lede': 'PDFs from your mail, read locally. Index one by one, then search the text or see what looks like a bill.',
  'docs.index': 'Index PDFs',
  'docs.retry': 'Retry locked PDFs',
  'docs.indexing': 'Reading PDFs…',
  'docs.indexed': 'Indexed {n}',
  'docs.left': '{n} left',
  'docs.none': 'No documents indexed yet.',
  'docs.name': 'File',
  'docs.subject': 'Subject',
  'docs.sender': 'From',
  'docs.date': 'Date',
  'docs.pages': 'Pages',
  'docs.amount': 'Amount',
  'docs.due': 'Due',
  'docs.bill': 'Bill',
  'docs.all': 'All documents',
  'docs.onlyBills': 'Bills only',
  'docs.searchPlaceholder': 'Search the extracted text…',
  'docs.locked': 'password required',
  'docs.passwordHint': 'Unlock a locked PDF here with its password and choose to remember it for that sender. The shared fallback list is in Settings → Privacy and retention.',
  'docs.open': 'Open',
  'docs.close': 'Close',
  'docs.noText': 'No text was extracted.',
  'docs.pdf': 'PDF',
  'docs.text': 'Text',
  'docs.unlock': 'Unlock',
  'docs.unlockTitle': 'Unlock PDF',
  'docs.unlockHelp': 'Enter the password the bank sent. It is checked here and never leaves this server.',
  'docs.password': 'Password',
  'docs.remember': 'Remember this password for future statements from this sender',
  'docs.rememberFor': 'Statements from {sender}',
  'docs.unlockSubmit': 'Unlock',
  'docs.unlocking': 'Unlocking…',
  'docs.wrongPassword': 'That password did not open the file.',
  'docs.openTab': 'Open in a new tab',
  'docs.pdfFailed': 'This document could not be shown. Try opening it in a new tab.',
  'docs.loadingPdf': 'Loading the PDF…',
  'docs.zoom': 'PDF controls',
  'docs.zoomIn': 'Zoom in',
  'docs.zoomOut': 'Zoom out',
  'docs.fit': 'Fit to width',
  'docs.download': 'Download',
  'docs.showDismissed': 'Show dismissed',
  'docs.addTitle': 'Add a message',
  'docs.addHint': 'Search a mailbox for a message whose PDFs were not indexed, then add them here.',
  'docs.mailbox': 'Mailbox',
  'docs.folder': 'Folder',
  'docs.searchSubject': 'Subject or sender',
  'docs.searchSubjectHint': 'Billing Statement',
  'docs.searchMailbox': 'Search the mailbox',
  'docs.addPdfs': 'Add PDFs',
  'docs.addDone': 'Added {n} PDF(s).',
  'docs.email': 'Email',
  'docs.emailTitle': 'Related email',
  'docs.emailMissing': 'The email could not be opened. It may have been moved or deleted.',
  'docs.ai': 'AI',
  'docs.analyzing': 'Reading the amount with AI…',
  'docs.aiNone': 'The model found no amount or due date.',
  'docs.dismiss': 'Dismiss',
  'docs.restore': 'Restore',
  'docs.dismissed': 'dismissed',
  'docs.cancel': 'Cancel',
  'sync.title': 'Sync & where is my mail',
  'sync.lede': 'What mailsift is watching, how far back it looked, and a live search of the mailbox for anything you cannot find here.',
  'sync.lastCheck': 'Last completed check',
  'sync.never': 'never',
  'sync.searchTitle': 'Where is this mail?',
  'sync.searchHint': 'Searches the mailbox itself (Gmail: All Mail, so archived mail is included). Nothing is stored.',
  'sync.query': 'Subject or sender',
  'sync.queryPlaceholder': 'Billing Statement',
  'sync.search': 'Search the mailbox',
  'sync.searching': 'Searching…',
  'sync.noResults': 'Nothing matched in the mailbox search.',
  'sync.foundIn': 'Found in',
  'sync.watching': 'What is being watched',
  'sync.mailbox': 'Mailbox',
  'sync.folders': 'Folders',
  'sync.defaultFolders': 'Inbox and spam',
  'sync.account': 'Account',
  'sync.folder': 'Folder',
  'sync.lastUid': 'Last UID',
  'sync.updated': 'Updated',
  'sync.stored': 'Stored',
  'sync.window': 'The first look reaches back {n} days. Older mail was never fetched.',
  'sync.archivedNote': 'Only the folders above are scanned. Mail archived by a Gmail filter is invisible unless All Mail or its label is added to the mailbox folders.',
  'sync.accountsNote': 'Only the mailboxes above are connected; mail in any other account never reaches mailsift.',
  'sync.dead': 'Messages that could not be triaged',
  'sync.deadNone': 'None.',
  'sync.from': 'From',
  'sync.subject': 'Subject',
  'sync.date': 'Date',
  'sync.pdf': 'PDF',
  'sync.savePdf': 'Save PDFs',
  'sync.savedPdf': 'Saved {n}, locked {m}',
  'sync.pdfFailed': 'failed',
  'shared.readOnly': 'These shared settings are managed by the owner.',
  'users.title': 'Users',
  'users.lede': 'People who can sign in to this mailsift. Each has their own mailboxes; the AI, schedule and privacy settings are shared.',
  'users.owner': 'Owner',
  'users.member': 'Member',
  'users.disabled': 'Disabled',
  'users.rename': 'Rename',
  'users.reset': 'Reset password',
  'users.disable': 'Disable',
  'users.enable': 'Enable',
  'users.delete': 'Delete',
  'users.create': 'Add a user',
  'users.username': 'Username',
  'users.password': 'Temporary password',
  'users.add': 'Create',
  'users.empty': 'No members yet.',
  'users.you': 'You',
  'users.lastLogin': 'Last sign-in',
  'users.never': 'Never',
  'users.created': 'Created',
  'users.mailboxes': 'Mailboxes',
  'users.locked': 'Locked until {at}',
  'users.failed': '{n} failed sign-ins',
  'users.dialogRename': 'Rename user',
  'users.dialogReset': 'Set a new password',
  'users.dialogDelete': 'Delete user?',
  'users.deleteBody': 'This deletes {name} and every triage record, draft, sent copy and notification subscription in their mail state. Mail on their provider is not touched. This cannot be undone.',
  'users.cancel': 'Cancel',
  'users.save': 'Save',
  'users.deleteConfirm': 'Delete',
  'users.newUsername': 'New username',
  'users.newPassword': 'New password',
  'users.passwordHelp': 'At least {n} characters. Tell the person; they can change it after signing in.',
  'users.activityLink': 'Activity log',
  'activity.title': 'Activity',
  'activity.lede': 'Sign-ins, settings changes, token rotations and user administration on this mailsift.',
  'activity.empty': 'No activity recorded yet.',
  'activity.when': 'When',
  'activity.who': 'Who',
  'activity.what': 'What',
  'activity.target': 'Target',
  'activity.result': 'Result',
  'activity.ok': 'OK',
  'activity.failed': 'Failed',
  'insights.title': 'Insights',
  'insights.lede': 'How your mail was judged, what it cost, and which senders are worth cleaning up.',
  'insights.messages': 'Judged',
  'insights.tasks': 'Open tasks',
  'insights.due': 'Due tasks',
  'insights.tokens': 'LLM tokens',
  'insights.cost': 'Estimated cost',
  'insights.importance': 'Importance',
  'insights.category': 'Categories',
  'insights.source': 'Decision source',
  'insights.senders': 'Most frequent senders',
  'insights.subscriptions': 'Subscriptions to review',
  'insights.subscriptionsEmpty': 'No recurring senders stood out yet.',
  'insights.mute': 'Mute sender',
  'insights.muted': 'Muted',
  'insights.unsubscribe': 'Unsubscribe',
  'insights.suggested': 'Suggested rules',
  'insights.suggestedEmpty': 'Mark a few messages as noise and a rule suggestion will appear here.',
  'insights.feedback': 'Feedback',
  'insights.intro': 'Last {days} days',
  'insights.count': '{n} messages',
  'insights.never': 'Never',
  'insights.last': 'Last: {at}',
  'insights.saved': 'Saved',
  'access.personalTokens': 'My MCP tokens',
  'access.personalBody': 'Give an assistant its own token. It sees only your mail, and a write token can act only on your mail.',
  'access.createRead': 'New read token',
  'access.createWrite': 'New write token',
  'access.revoke': 'Revoke',
  'access.none': 'No personal tokens yet.',
  'access.tokenShown': 'Copy this token now. It is not shown again.',
  'access.writable': 'write',
  'access.readOnly': 'read',
  'access.totp': 'Two-step sign-in',
  'access.totpBody': 'Ask for a six-digit code from an authenticator app when signing in. The password alone is then not enough.',
  'access.totpOn': 'On',
  'access.totpOff': 'Off',
  'access.totpEnable': 'Set up',
  'access.totpDisable': 'Turn off',
  'access.totpScan': 'Add this secret to your authenticator app, then enter the six-digit code it shows.',
  'access.totpCode': 'Authenticator code',
  'access.totpDone': 'Two-step sign-in is on.',
  'access.totpOffDone': 'Two-step sign-in is off.',
  'access.totpPassword': 'Password to confirm',
  'lang.face': '中文',
  'common.save': 'Save',
  'common.saving': 'Saving…',
  'common.saved': 'Saved',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.delete': 'Delete',
  'common.test': 'Test',
  'common.testing': 'Testing…',
  'common.more': 'More options',
  'common.copy': 'Copy',
  'common.copied': 'Copied',
  'common.set': 'Set',
  'common.notSet': 'Not set',
  'common.remove': 'Remove',
  'common.removed': 'Will be removed',
  'common.undo': 'Undo',
  'common.default': 'Default: {v}',
  'common.on': 'On',
  'common.off': 'Off',
  'common.error': 'Something went wrong.',
  'common.unsaved': 'You have unsaved changes.',
  'common.switchLose': 'Changes not saved yet on this page will be lost. Switch the language anyway?',
  'secret.keep': 'Saved — type to replace',
  'banner.restarting': 'Applying changes — mailsift is restarting…',
  'banner.slow': 'mailsift has not come back yet. Check the service log.',
  'banner.manual': 'Saved. mailsift was started without its supervisor, so restart it to apply the changes.',
  'banner.applied': 'Changes applied.',
  'banner.idle': 'No mailbox is being checked. Add one, or sign in to the ones waiting for it.',
  'banner.offline': 'mailsift is not answering. It may be restarting.',
  'mb.title': 'Mailboxes',
  'mb.lede': 'mailsift signs in to these over IMAP. Passwords stay on this server and are never shown again.',
  'mb.add': 'Add mailbox',
  'mb.none': 'No mailbox yet.',
  'mb.ready': 'Ready',
  'mb.disabled': 'Off',
  'mb.needsAuth': 'Needs sign-in',
  'mb.needsPassword': 'Needs password',
  'mb.invalid': 'Check settings',
  'mb.readOnly': 'Signed in for reading only — sign in again to send',
  'mb.signin': 'Sign in',
  'mb.signinAgain': 'Sign in again',
  'mb.edit': 'Edit',
  'mb.test': 'Test',
  'mb.dialogNew': 'Add a mailbox',
  'mb.dialogEdit': 'Edit mailbox',
  'mb.provider': 'Provider',
  'mb.address': 'Email address',
  'mb.password': 'App password',
  'mb.passwordHelp': 'Most providers want an app password (or authorization code) created in their settings, with IMAP turned on — not your normal login password.',
  'mb.passwordKeep': 'Saved — leave empty to keep',
  'mb.oauthNote': 'This mailbox signs in with {p}. After saving, you will be sent to {p} to allow access.',
  'mb.oauthApp': 'mailsift needs an OAuth app of your own for {p}. Enter it once; it is used for every {p} mailbox.',
  'mb.name': 'Display name',
  'mb.namePlaceholder': 'Work, Personal…',
  'mb.folders': 'Folders to check',
  'mb.foldersDefault': 'Inbox and spam',
  'mb.foldersAll': 'All folders except Sent, Drafts and Trash',
  'mb.foldersCustom': 'Choose folders',
  'mb.foldersHint': 'Test the connection to list this mailbox\'s folders.',
  'mb.testConn': 'Test connection',
  'mb.testOk': 'Connected. {n} folders found.',
  'mb.testFirst': 'Sign in first, then test.',
  'mb.server': 'Server and sending',
  'mb.host': 'IMAP server',
  'mb.port': 'IMAP port',
  'mb.ssl': 'Use SSL/TLS',
  'mb.smtpHost': 'SMTP server',
  'mb.smtpHostHelp': 'For sending from the web view. Known providers need nothing here.',
  'mb.smtpPort': 'SMTP port',
  'mb.fromName': 'Send as (name)',
  'mb.authserv': 'Authentication-Results server ID',
  'mb.authservHelp': 'What this mailbox\'s receiving server calls itself (e.g. mx.example.com), to show whether a sender was verified. Known for major providers; "none" turns it off.',
  'mb.enabled': 'Check this mailbox',
  'mb.saveSignin': 'Save and sign in',
  'mb.deleteConfirm': 'Delete {a}? mailsift stops checking it and forgets its password or sign-in. Mail on the server is not touched.',
  'mb.deleted': 'Mailbox deleted.',
  'mb.providerDefault': 'Provider default',
  'oauth.pasteTitle': 'Finish signing in',
  'oauth.pasteBody': 'A new tab opened at {p}. After you allow access it ends on a page that does not load (http://localhost:8765/…). Copy that page\'s full address from the address bar and paste it here.',
  'oauth.pastePlaceholder': 'http://localhost:8765/?code=…',
  'oauth.finish': 'Finish',
  'oauth.ok': 'Signed in. Testing the connection…',
  'oauth.denied': 'The sign-in was declined or cancelled.',
  'oauth.failed': 'The sign-in did not complete. Try again.',
  'oauth.expired': 'That sign-in had expired. Start it again.',
  'oauth.reopen': 'Open the sign-in page again',
  'ai.lede': 'Without a model, mailsift judges mail with local rules and keywords. With one, parts of each message (redacted, see Privacy) go to the provider you choose.',
  'notifications.lede': 'Where important mail is pushed. The web view and browser notifications work without any of these.',
  'notifications.test': 'Send a test',
  'triage.lede': 'What counts as important to you.',
  'schedule.lede': 'How often mailboxes are checked, and the daily digest of what was not pushed.',
  'privacy.lede': 'What reaches the model, and how long mailsift keeps its own records.',
  'sending.lede': 'Replying and sending from the web view (and MCP clients holding the write token).',
  'oauth.lede': 'Gmail and Outlook usually refuse app passwords. Register an OAuth app once and every such mailbox signs in through it.',
  'advanced.lede': 'Limits and diagnostics. The defaults suit almost everyone.',
  'access.lede': 'How you, and the AI clients you connect, reach this server.',
  'access.password': 'Administrator password',
  'access.passwordBody': 'Signs in to the web view and these settings.',
  'access.change': 'Change password',
  'access.current': 'Current password',
  'access.new': 'New password',
  'access.changed': 'Password changed. Other browsers were signed out.',
  'access.endOthers': 'Sign out other browsers',
  'access.ended': 'Signed out {n} other session(s).',
  'access.forgot': 'Forgot it? On the server run: docker compose exec mailsift node dist/src/main.js --reset-admin',
  'access.mcp': 'MCP',
  'access.mcpBody': 'AI clients connect to this address with a token as the Bearer credential.',
  'access.endpoint': 'Endpoint',
  'access.read': 'Read token',
  'access.readBody': 'Reads triage results and mail.',
  'access.write': 'Write token',
  'access.writeBody': 'Everything the read token does, plus acting on mail and sending it.',
  'access.generate': 'Generate new',
  'access.generateConfirm': 'Generate a new {k}? The current one stops working.',
  'access.tokenTitle': 'Your new {k}',
  'access.tokenBody': 'Copy it now: it is not shown again. Clients using the old one need this one.',
  'access.tokenRestart': 'mailsift restarts to start using it.',
  'access.https': 'Reached over HTTPS.',
  'access.loopback': 'Reached at a local address (this machine or an SSH tunnel). For access from elsewhere, put an HTTPS reverse proxy in front.',
  'setup.step1': 'Mailboxes',
  'setup.step2': 'AI model',
  'setup.step3': 'Notifications',
  'setup.step4': 'Start',
  'setup.intro1': 'Add the mailboxes mailsift should watch. One is enough to start; you can add more later in Settings.',
  'setup.intro2': 'Optional. A model writes summaries and judges importance far better than keywords.',
  'setup.intro3': 'Optional. The web view and browser notifications work without these.',
  'setup.intro4': 'Everything else — rules, schedule, privacy, MCP — is in Settings whenever you want it.',
  'setup.next': 'Continue',
  'setup.back': 'Back',
  'setup.skip': 'Skip for now',
  'setup.saveNext': 'Save and continue',
  'setup.needMailbox': 'Add a mailbox that is ready (tested, or signed in) to continue.',
  'setup.start': 'Start mailsift',
  'setup.starting': 'Starting… the first check of your mailboxes begins now.',
  'setup.sumMailboxes': 'Mailboxes',
  'setup.sumModel': 'AI model',
  'setup.sumNotify': 'Notifications',
  'setup.sumTz': 'Time zone',
  'setup.modelNone': 'None — local rules and keywords',
  'setup.notifyNone': 'Web view and browser notifications only',
  'setup.ready': '{n} ready',
  'setup.waiting': '{n} waiting for sign-in',
};

const ZH: Dict = {
  'claim.title': '设置 mailsift',
  'claim.intro': '输入服务日志里的一次性设置码，然后设置以后登录用的用户名和密码。',
  'claim.code': '设置码',
  'claim.username': '用户名',
  'claim.password': '管理员密码',
  'claim.confirm': '再次输入密码',
  'claim.submit': '继续',
  'claim.mismatch': '两次输入的密码不一致。',
  'claim.short': '至少 {n} 个字符。',
  'claim.where': '设置码在哪里？',
  'claim.whereBody': 'mailsift 启动时会打印在日志里。使用 Docker Compose 时运行：docker compose logs mailsift。重启会生成新的设置码：docker compose restart mailsift。',
  'nav.settings': '设置',
  'nav.setup': '初始设置',
  'nav.back': '返回邮件',
  'nav.signout': '退出登录',
  'nav.users': '用户',
  'nav.sync': '同步',
  'nav.documents': '文档',
  'docs.title': '文档与账单',
  'docs.lede': '来自邮件的 PDF，在本地读取。逐个索引后可以搜索文字，或查看像账单的文档。',
  'docs.index': '索引 PDF',
  'docs.retry': '重试锁定的 PDF',
  'docs.indexing': '正在读取 PDF…',
  'docs.indexed': '已索引 {n}',
  'docs.left': '剩余 {n}',
  'docs.none': '还没有索引文档。',
  'docs.name': '文件',
  'docs.subject': '主题',
  'docs.sender': '发件人',
  'docs.date': '日期',
  'docs.pages': '页数',
  'docs.amount': '金额',
  'docs.due': '到期',
  'docs.bill': '账单',
  'docs.all': '全部文档',
  'docs.onlyBills': '只看账单',
  'docs.searchPlaceholder': '搜索提取的文字…',
  'docs.locked': '需要密码',
  'docs.passwordHint': '在这里用密码解锁 PDF，并可以记住这个发件人的密码。共享备用列表在“设置 → 隐私与保留”。',
  'docs.open': '打开',
  'docs.close': '关闭',
  'docs.noText': '没有提取到文字。',
  'docs.pdf': 'PDF',
  'docs.text': '文字',
  'docs.unlock': '解锁',
  'docs.unlockTitle': '解锁 PDF',
  'docs.unlockHelp': '输入银行发来的密码。密码只在本机验证，不会离开服务器。',
  'docs.password': '密码',
  'docs.remember': '记住这个密码，用于这个发件人以后的账单',
  'docs.rememberFor': '来自 {sender} 的账单',
  'docs.unlockSubmit': '解锁',
  'docs.unlocking': '解锁中…',
  'docs.wrongPassword': '这个密码打不开文件。',
  'docs.openTab': '在新标签页打开',
  'docs.pdfFailed': '无法显示这个文档，请尝试在新标签页打开。',
  'docs.loadingPdf': '正在加载 PDF…',
  'docs.zoom': 'PDF 控件',
  'docs.zoomIn': '放大',
  'docs.zoomOut': '缩小',
  'docs.fit': '适应宽度',
  'docs.download': '下载',
  'docs.showDismissed': '显示已忽略',
  'docs.addTitle': '添加邮件',
  'docs.addHint': '在邮箱中搜索没有索引 PDF 的邮件，然后在这里添加。',
  'docs.mailbox': '邮箱',
  'docs.folder': '文件夹',
  'docs.searchSubject': '主题或发件人',
  'docs.searchSubjectHint': 'Billing Statement',
  'docs.searchMailbox': '搜索邮箱',
  'docs.addPdfs': '添加 PDF',
  'docs.addDone': '已添加 {n} 个 PDF。',
  'docs.email': '邮件',
  'docs.emailTitle': '相关邮件',
  'docs.emailMissing': '无法打开这封邮件，可能已被移动或删除。',
  'docs.ai': 'AI',
  'docs.analyzing': '正在用 AI 读取金额…',
  'docs.aiNone': '模型没有找到金额或到期日。',
  'docs.dismiss': '忽略',
  'docs.restore': '恢复',
  'docs.dismissed': '已忽略',
  'docs.cancel': '取消',
  'sync.title': '同步与邮件位置',
  'sync.lede': 'mailsift 正在监控什么、回溯了多久，以及直接在邮箱里搜索找不到的邮件。',
  'sync.lastCheck': '上次完成的检查',
  'sync.never': '从未',
  'sync.searchTitle': '这封邮件在哪里？',
  'sync.searchHint': '直接搜索邮箱（Gmail 使用“所有邮件”，包含已归档邮件）。不会保存任何内容。',
  'sync.query': '主题或发件人',
  'sync.queryPlaceholder': 'Billing Statement',
  'sync.search': '搜索邮箱',
  'sync.searching': '搜索中…',
  'sync.noResults': '邮箱搜索没有匹配。',
  'sync.foundIn': '找到于',
  'sync.watching': '正在监控',
  'sync.mailbox': '邮箱',
  'sync.folders': '文件夹',
  'sync.defaultFolders': '收件箱和垃圾邮件',
  'sync.account': '账号',
  'sync.folder': '文件夹',
  'sync.lastUid': '最后 UID',
  'sync.updated': '更新时间',
  'sync.stored': '已存',
  'sync.window': '首次回溯 {n} 天。更早的邮件没有抓取。',
  'sync.archivedNote': '只扫描上面的文件夹。被 Gmail 过滤器归档的邮件，除非把“所有邮件”或对应标签加入文件夹，否则看不到。',
  'sync.accountsNote': '只连接了上面的邮箱；其他账号的邮件不会进入 mailsift。',
  'sync.dead': '无法处理的邮件',
  'sync.deadNone': '没有。',
  'sync.from': '发件人',
  'sync.subject': '主题',
  'sync.date': '日期',
  'sync.pdf': 'PDF',
  'sync.savePdf': '保存 PDF',
  'sync.savedPdf': '已保存 {n}，需要密码 {m}',
  'sync.pdfFailed': '失败',
  'shared.readOnly': '这些共享设置由管理员管理。',
  'users.title': '用户',
  'users.lede': '可以登录这个 mailsift 的人。每个人有自己的邮箱；AI、计划和隐私设置是共享的。',
  'users.owner': '管理员',
  'users.member': '成员',
  'users.disabled': '已停用',
  'users.rename': '改名',
  'users.reset': '重置密码',
  'users.disable': '停用',
  'users.enable': '启用',
  'users.delete': '删除',
  'users.create': '添加用户',
  'users.username': '用户名',
  'users.password': '临时密码',
  'users.add': '创建',
  'users.empty': '还没有成员。',
  'users.you': '你',
  'users.lastLogin': '上次登录',
  'users.never': '从未',
  'users.created': '创建于',
  'users.mailboxes': '邮箱',
  'users.locked': '锁定至 {at}',
  'users.failed': '{n} 次登录失败',
  'users.dialogRename': '修改用户名',
  'users.dialogReset': '设置新密码',
  'users.dialogDelete': '删除用户？',
  'users.deleteBody': '这会删除 {name} 以及其邮件状态中的全部分诊记录、草稿、已发送副本和通知订阅。邮箱服务商那里的邮件不会被删除。此操作无法撤销。',
  'users.cancel': '取消',
  'users.save': '保存',
  'users.deleteConfirm': '删除',
  'users.newUsername': '新用户名',
  'users.newPassword': '新密码',
  'users.passwordHelp': '至少 {n} 个字符。请告诉对方；对方登录后可以自行修改。',
  'users.activityLink': '操作日志',
  'activity.title': '操作日志',
  'activity.lede': '这个 mailsift 上的登录、设置修改、令牌轮换和用户管理。',
  'activity.empty': '还没有操作记录。',
  'activity.when': '时间',
  'activity.who': '谁',
  'activity.what': '操作',
  'activity.target': '对象',
  'activity.result': '结果',
  'activity.ok': '成功',
  'activity.failed': '失败',
  'insights.title': '洞察',
  'insights.lede': '邮件如何被判定、花了多少，以及哪些发件人值得清理。',
  'insights.messages': '已判断',
  'insights.tasks': '待办任务',
  'insights.due': '到期任务',
  'insights.tokens': 'LLM 令牌',
  'insights.cost': '估算费用',
  'insights.importance': '重要度',
  'insights.category': '分类',
  'insights.source': '判定来源',
  'insights.senders': '最频繁的发件人',
  'insights.subscriptions': '待检查的订阅',
  'insights.subscriptionsEmpty': '暂时没有明显的重复发件人。',
  'insights.mute': '静音发件人',
  'insights.muted': '已静音',
  'insights.unsubscribe': '退订',
  'insights.suggested': '建议规则',
  'insights.suggestedEmpty': '把几封邮件标为噪音后，这里会出现规则建议。',
  'insights.feedback': '反馈',
  'insights.intro': '最近 {days} 天',
  'insights.count': '{n} 封邮件',
  'insights.never': '从未',
  'insights.last': '最近：{at}',
  'insights.saved': '已保存',
  'access.personalTokens': '我的 MCP 令牌',
  'access.personalBody': '给智能体一个只属于你的令牌。它只能看到你的邮件；写令牌也只能操作你的邮件。',
  'access.createRead': '新建只读令牌',
  'access.createWrite': '新建写令牌',
  'access.revoke': '撤销',
  'access.none': '还没有个人令牌。',
  'access.tokenShown': '现在复制这个令牌，之后不会再显示。',
  'access.writable': '写',
  'access.readOnly': '只读',
  'access.totp': '两步登录',
  'access.totpBody': '登录时额外要求验证器应用中的六位动态验证码；只有密码将不够。',
  'access.totpOn': '已开启',
  'access.totpOff': '未开启',
  'access.totpEnable': '设置',
  'access.totpDisable': '关闭',
  'access.totpScan': '把这个密钥添加到验证器应用，然后输入它显示的六位验证码。',
  'access.totpCode': '动态验证码',
  'access.totpDone': '两步登录已开启。',
  'access.totpOffDone': '两步登录已关闭。',
  'access.totpPassword': '输入密码确认',
  'lang.face': 'EN',
  'common.save': '保存',
  'common.saving': '正在保存…',
  'common.saved': '已保存',
  'common.cancel': '取消',
  'common.close': '关闭',
  'common.delete': '删除',
  'common.test': '测试',
  'common.testing': '正在测试…',
  'common.more': '更多选项',
  'common.copy': '复制',
  'common.copied': '已复制',
  'common.set': '已设置',
  'common.notSet': '未设置',
  'common.remove': '移除',
  'common.removed': '保存后移除',
  'common.undo': '撤销',
  'common.default': '默认：{v}',
  'common.on': '开',
  'common.off': '关',
  'common.error': '出了点问题。',
  'common.unsaved': '有未保存的修改。',
  'common.switchLose': '本页还没保存的修改会丢失，仍要切换语言吗？',
  'secret.keep': '已保存，输入新值以替换',
  'banner.restarting': '正在应用修改，mailsift 正在重启…',
  'banner.slow': 'mailsift 还没有恢复，请查看服务日志。',
  'banner.manual': '已保存。mailsift 没有通过监督进程启动，请手动重启以应用修改。',
  'banner.applied': '修改已生效。',
  'banner.idle': '目前没有在检查任何邮箱。请添加邮箱，或为等待中的邮箱完成登录授权。',
  'banner.offline': 'mailsift 没有响应，可能正在重启。',
  'mb.title': '邮箱',
  'mb.lede': 'mailsift 通过 IMAP 登录这些邮箱。密码只保存在这台服务器上，保存后不会再显示。',
  'mb.add': '添加邮箱',
  'mb.none': '还没有邮箱。',
  'mb.ready': '就绪',
  'mb.disabled': '已停用',
  'mb.needsAuth': '需要登录授权',
  'mb.needsPassword': '需要密码',
  'mb.invalid': '设置有误',
  'mb.readOnly': '当前授权只能读取，重新登录授权后才能发信',
  'mb.signin': '登录授权',
  'mb.signinAgain': '重新授权',
  'mb.edit': '编辑',
  'mb.test': '测试',
  'mb.dialogNew': '添加邮箱',
  'mb.dialogEdit': '编辑邮箱',
  'mb.provider': '邮件服务商',
  'mb.address': '邮箱地址',
  'mb.password': '应用专用密码',
  'mb.passwordHelp': '大多数服务商需要在邮箱设置里开启 IMAP 并生成应用专用密码（授权码），不是平时的登录密码。',
  'mb.passwordKeep': '已保存，留空则保持不变',
  'mb.oauthNote': '这个邮箱通过 {p} 登录授权。保存后会跳转到 {p} 页面确认授权。',
  'mb.oauthApp': 'mailsift 需要你自己的 {p} OAuth 应用。只需填写一次，所有 {p} 邮箱共用。',
  'mb.name': '显示名称',
  'mb.namePlaceholder': '工作、个人…',
  'mb.folders': '检查的文件夹',
  'mb.foldersDefault': '收件箱和垃圾邮件',
  'mb.foldersAll': '除已发送、草稿和已删除外的全部文件夹',
  'mb.foldersCustom': '自选文件夹',
  'mb.foldersHint': '测试连接后会列出这个邮箱的文件夹。',
  'mb.testConn': '测试连接',
  'mb.testOk': '连接成功，找到 {n} 个文件夹。',
  'mb.testFirst': '请先登录授权，再测试。',
  'mb.server': '服务器与发信',
  'mb.host': 'IMAP 服务器',
  'mb.port': 'IMAP 端口',
  'mb.ssl': '使用 SSL/TLS',
  'mb.smtpHost': 'SMTP 服务器',
  'mb.smtpHostHelp': '用于从网页发信。已知服务商无需填写。',
  'mb.smtpPort': 'SMTP 端口',
  'mb.fromName': '发件人名称',
  'mb.authserv': 'Authentication-Results 服务器标识',
  'mb.authservHelp': '这个邮箱的收信服务器在 Authentication-Results 中的名称（如 mx.example.com），用于显示发件人是否通过验证。主流服务商已内置；填 none 关闭。',
  'mb.enabled': '检查这个邮箱',
  'mb.saveSignin': '保存并登录授权',
  'mb.deleteConfirm': '删除 {a}？mailsift 将停止检查它，并删除保存的密码或授权。邮箱里的邮件不受影响。',
  'mb.deleted': '已删除邮箱。',
  'mb.providerDefault': '服务商默认',
  'oauth.pasteTitle': '完成登录授权',
  'oauth.pasteBody': '已在新标签页打开 {p}。允许访问后，页面会跳到一个打不开的地址（http://localhost:8765/…）。请从地址栏复制完整地址，粘贴到这里。',
  'oauth.pastePlaceholder': 'http://localhost:8765/?code=…',
  'oauth.finish': '完成',
  'oauth.ok': '授权成功，正在测试连接…',
  'oauth.denied': '授权被拒绝或已取消。',
  'oauth.failed': '授权没有完成，请重试。',
  'oauth.expired': '这次授权已过期，请重新开始。',
  'oauth.reopen': '重新打开授权页面',
  'ai.lede': '不配置模型时，mailsift 用本地规则和关键词判断。配置后，每封邮件的部分内容（已脱敏，见“隐私”）会发送给你选择的服务商。',
  'notifications.lede': '重要邮件推送到哪里。不配置这些，网页和浏览器通知也能正常使用。',
  'notifications.test': '发送测试',
  'triage.lede': '对你来说什么算重要。',
  'schedule.lede': '多久检查一次邮箱，以及未实时推送邮件的每日摘要。',
  'privacy.lede': '哪些内容会发给模型，以及 mailsift 自己的记录保留多久。',
  'sending.lede': '从网页（以及持有写令牌的 MCP 客户端）回复和发信。',
  'oauth.lede': 'Gmail 和 Outlook 通常不接受应用专用密码。注册一次 OAuth 应用，所有这类邮箱都通过它登录。',
  'advanced.lede': '各类上限与诊断选项。默认值适合绝大多数情况。',
  'access.lede': '你和你连接的 AI 客户端如何访问这台服务器。',
  'access.password': '管理员密码',
  'access.passwordBody': '用于登录网页和这些设置。',
  'access.change': '修改密码',
  'access.current': '当前密码',
  'access.new': '新密码',
  'access.changed': '密码已修改，其他浏览器已退出登录。',
  'access.endOthers': '让其他浏览器退出登录',
  'access.ended': '已结束 {n} 个其他会话。',
  'access.forgot': '忘记密码？在服务器上运行：docker compose exec mailsift node dist/src/main.js --reset-admin',
  'access.mcp': 'MCP',
  'access.mcpBody': 'AI 客户端连接这个地址，并把令牌作为 Bearer 凭证。',
  'access.endpoint': '地址',
  'access.read': '只读令牌',
  'access.readBody': '读取分诊结果和邮件。',
  'access.write': '写令牌',
  'access.writeBody': '包含只读令牌的全部权限，并且可以处理邮件和发信。',
  'access.generate': '生成新令牌',
  'access.generateConfirm': '生成新的{k}？当前的令牌将失效。',
  'access.tokenTitle': '新的{k}',
  'access.tokenBody': '请立即复制，之后不会再显示。使用旧令牌的客户端需要换成这个。',
  'access.tokenRestart': 'mailsift 会重启以启用它。',
  'access.https': '当前通过 HTTPS 访问。',
  'access.loopback': '当前通过本机地址访问（本机或 SSH 隧道）。如需从其他地方访问，请在前面配置 HTTPS 反向代理。',
  'setup.step1': '邮箱',
  'setup.step2': 'AI 模型',
  'setup.step3': '通知',
  'setup.step4': '开始',
  'setup.intro1': '添加 mailsift 要监控的邮箱。一个就可以开始，之后可以在设置里继续添加。',
  'setup.intro2': '可选。模型写摘要、判断重要度都远好于关键词。',
  'setup.intro3': '可选。不配置这些，网页和浏览器通知也能正常使用。',
  'setup.intro4': '其他设置（规则、检查频率、隐私、MCP）随时可以在“设置”里修改。',
  'setup.next': '继续',
  'setup.back': '上一步',
  'setup.skip': '暂时跳过',
  'setup.saveNext': '保存并继续',
  'setup.needMailbox': '需要至少一个就绪的邮箱（测试通过或已登录授权）才能继续。',
  'setup.start': '启动 mailsift',
  'setup.starting': '正在启动…马上开始第一次检查邮箱。',
  'setup.sumMailboxes': '邮箱',
  'setup.sumModel': 'AI 模型',
  'setup.sumNotify': '通知',
  'setup.sumTz': '时区',
  'setup.modelNone': '无，使用本地规则和关键词',
  'setup.notifyNone': '仅网页和浏览器通知',
  'setup.ready': '{n} 个就绪',
  'setup.waiting': '{n} 个等待登录授权',
};

const PROVIDER_LABELS: Record<string, [string, string]> = {
  gmail: ['Gmail (Google sign-in)', 'Gmail（Google 登录授权）'],
  gmail_pw: ['Gmail (app password)', 'Gmail（应用专用密码）'],
  outlook: ['Outlook / Microsoft 365', 'Outlook / Microsoft 365'],
  qq: ['QQ Mail', 'QQ 邮箱'],
  qq_biz: ['Tencent Exmail', '腾讯企业邮箱'],
  '163': ['NetEase 163', '网易 163 邮箱'],
  '126': ['NetEase 126', '网易 126 邮箱'],
  sina: ['Sina Mail', '新浪邮箱'],
  aliyun: ['Alibaba Mail', '阿里邮箱'],
  feishu: ['Feishu Mail', '飞书邮箱'],
  lark: ['Lark Mail', 'Lark 邮箱'],
  icloud: ['iCloud Mail', 'iCloud 邮箱'],
  fastmail: ['Fastmail', 'Fastmail'],
  yahoo: ['Yahoo Mail', 'Yahoo 邮箱'],
  zoho: ['Zoho Mail', 'Zoho 邮箱'],
  yandex: ['Yandex Mail', 'Yandex 邮箱'],
  gmx: ['GMX', 'GMX'],
  imap: ['Other IMAP server', '其他 IMAP 服务器'],
};

const EN_PROVIDER_ORDER = ['gmail', 'outlook', 'icloud', 'fastmail', 'yahoo', 'zoho', 'yandex', 'gmx', 'gmail_pw',
  'qq', 'qq_biz', '163', '126', 'sina', 'aliyun', 'feishu', 'lark', 'imap'];
const ZH_PROVIDER_ORDER = ['qq', 'qq_biz', '163', '126', 'feishu', 'lark', 'aliyun', 'sina', 'gmail', 'gmail_pw', 'outlook',
  'icloud', 'fastmail', 'yahoo', 'zoho', 'yandex', 'gmx', 'imap'];

const SETTINGS_SECTIONS: SectionId[] = ['ai', 'notifications', 'triage', 'schedule', 'privacy', 'sending', 'access', 'advanced'];

function dict(lang: Language): Dict {
  return lang === 'zh-CN' ? ZH : EN;
}

/** The theme the mail view stored, applied before first paint. */
const THEME_BOOT = "(function(){try{var c=localStorage.getItem('theme');"
  + "document.documentElement.dataset.theme=c==='dark'?'dark':'light';"
  + "document.cookie='theme='+(c==='dark'?'dark':'light')+';path=/;max-age=31536000;SameSite=Lax';"
  + "var p=localStorage.getItem('palette');"
  + "if(!/^(classic|sage|sand|plum)$/.test(p))p='classic';"
  + "document.documentElement.dataset.palette=p;"
  + "document.cookie='palette='+p+';path=/;max-age=31536000;SameSite=Lax';"
  + "var d=c==='dark';"
  + "var m=document.querySelector('meta[name=theme-color]');"
  + "var b=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();"
  + "if(m&&b)m.setAttribute('content',b);"
  + "var a=document.querySelector('meta[name=apple-mobile-web-app-status-bar-style]');"
  + "if(a)a.setAttribute('content',d?'black-translucent':'default');"
  + "}catch(e){}})();";

function shell(lang: Language, title: string, body: string, nonce: string): string {
  return '<!doctype html><html lang="' + lang + '"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    + '<meta name="referrer" content="no-referrer">'
    + '<meta name="theme-color" content="' + LIGHT_BAR + '">'
    + '<meta name="apple-mobile-web-app-capable" content="yes">'
    + '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'
    + '<meta name="apple-mobile-web-app-title" content="mailsift">'
    + '<meta name="mobile-web-app-capable" content="yes">'
    + '<link rel="icon" type="image/png" href="/favicon.ico?v=3">'
    + '<title>' + escapeHtml(title) + ' · mailsift</title>'
    + '<style>' + styles() + SETTINGS_CSS + '</style>'
    + '<script nonce="' + nonce + '">' + THEME_BOOT + '</script>'
    + '</head><body>' + body + '</body></html>';
}

/** JSON inside a script element, safe against a closing tag in any string. */
function embedJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

export function renderClaimPage(lang: Language, nonce: string, version: string): string {
  const d = dict(lang);
  const s = (key: string): string => escapeHtml(d[key] ?? key);
  const next = lang === 'zh-CN' ? 'en' : 'zh-CN';
  return shell(lang, d['claim.title']!, `
    <form class="login st-claim" id="claim" novalidate>
      <img class="brand-mark" src="/icon-192.png?v=3" alt="" aria-hidden="true">
      <h1>${s('claim.title')}</h1>
      <p class="muted">${s('claim.intro')}</p>
      <label class="st-claim-label" for="code">${s('claim.code')}</label>
      <input id="code" name="code" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX" required autofocus>
      <label class="st-claim-label" for="username">${s('claim.username')}</label>
      <input id="username" name="username" value="owner" autocomplete="username" autocapitalize="none" spellcheck="false" required>
      <label class="st-claim-label" for="password">${s('claim.password')}</label>
      <input id="password" type="password" autocomplete="new-password" minlength="${ADMIN_PASSWORD_MIN}" required>
      <label class="st-claim-label" for="confirm">${s('claim.confirm')}</label>
      <input id="confirm" type="password" autocomplete="new-password" required>
      <button type="submit" class="primary-action">${s('claim.submit')}</button>
      <p class="error" role="alert" id="claim-error" hidden></p>
      <details class="st-where"><summary>${s('claim.where')}</summary><p>${s('claim.whereBody')}</p></details>
      <button type="button" id="lang" class="lang">${s('lang.face')}</button>
      <p class="version">${escapeHtml(version)}</p>
    </form>
    <script nonce="${nonce}">${storeLanguageScript()}
    (function () {
      var d = ${embedJson({ mismatch: d['claim.mismatch'], short: (d['claim.short'] ?? '').replace('{n}', String(ADMIN_PASSWORD_MIN)), error: d['common.error'] })};
      var form = document.getElementById('claim');
      var error = document.getElementById('claim-error');
      document.getElementById('lang').onclick = function () { storeLanguage('${next}'); location.reload(); };
      form.onsubmit = async function (event) {
        event.preventDefault();
        error.hidden = true;
        var password = document.getElementById('password').value;
        if (Array.from(password).length < ${ADMIN_PASSWORD_MIN}) { error.textContent = d.short; error.hidden = false; return; }
        if (password !== document.getElementById('confirm').value) { error.textContent = d.mismatch; error.hidden = false; return; }
        var button = form.querySelector('button[type=submit]');
        button.disabled = true;
        try {
          var response = await fetch('/api/admin/claim', {
            method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin',
            body: JSON.stringify({
              code: document.getElementById('code').value,
              username: document.getElementById('username').value,
              password: password,
            }),
          });
          var data = await response.json().catch(function () { return {}; });
          if (response.ok) { location.replace('/setup'); return; }
          error.textContent = data.error || d.error;
          error.hidden = false;
        } catch (e) {
          error.textContent = d.error;
          error.hidden = false;
        }
        button.disabled = false;
      };
    })();</script>`, nonce);
}

/** Everything on the page that depends on the language, for one language. */
function locale(lang: Language): Record<string, unknown> {
  const d = dict(lang);
  const zh = lang === 'zh-CN';
  return {
    strings: d,
    sections: SETTINGS_SECTIONS.map((id) => ({ id, title: words(SECTION_TITLES[id], lang) })),
    oauthTitle: words(SECTION_TITLES.oauth, lang),
    fields: SETTING_FIELDS.map((field) => ({
      key: field.key,
      section: field.section,
      type: field.type,
      label: words(field.label, lang),
      help: words(field.help, lang),
      defaultValue: field.defaultValue ?? '',
      placeholder: field.placeholder ?? '',
      advanced: Boolean(field.advanced),
      personal: Boolean(field.personal),
      overridable: Boolean(field.overridable),
      ...(field.min !== undefined ? { min: field.min } : {}),
      ...(field.max !== undefined ? { max: field.max } : {}),
      ...(field.options ? { options: field.options.map((option) => ({ value: option.value, label: words(option.label, lang) })) } : {}),
    })),
    // Object order would put "163" and "126" first; list the likely ones first for each language.
    providers: (zh ? ZH_PROVIDER_ORDER : EN_PROVIDER_ORDER)
      .map((id) => [id, (PROVIDER_PRESETS as Record<string, { host?: string; port: number; auth: string }>)[id]!] as const)
      .map(([id, preset]) => ({
        id,
        label: (PROVIDER_LABELS[id] ?? [id, id])[zh ? 1 : 0],
        oauth: preset.auth !== 'password',
        host: preset.host ?? '',
        port: preset.port,
      })),
  };
}

/**
 * The settings page, with the current state and both languages in it: the
 * page draws at once, without a round trip for its data, and the language
 * switch rewords it in place. Over a slow link every request saved is felt.
 */
export function renderSettingsPage(
  lang: Language, nonce: string, version: string, mode: 'setup' | 'settings', state: unknown, boot: string,
): string {
  const d = dict(lang);
  const bootData = {
    mode,
    lang,
    version,
    minPassword: ADMIN_PASSWORD_MIN,
    state,
    boot,
    locales: { en: locale('en'), 'zh-CN': locale('zh-CN') },
  };
  const title = mode === 'setup' ? d['nav.setup']! : d['nav.settings']!;
  const asOwner = (state as { user?: { role?: string } } | undefined)?.user?.role === 'owner';
  return shell(lang, title, `
    <header class="st-header">
      <div class="st-header-inner">
        <a class="brand" href="${mode === 'setup' ? '/setup' : '/'}"><img class="brand-mark" src="/icon-192.png?v=3" alt="" aria-hidden="true"><strong>mailsift</strong></a>
        <span class="st-crumb" id="crumb">${escapeHtml(title)}</span>
        <div class="st-header-actions">
          ${mode === 'settings' ? `<a class="word-btn" href="/sync">${escapeHtml(d['nav.sync']!)}</a>` : ''}
          ${mode === 'settings' && asOwner ? `<a class="word-btn" href="/users">${escapeHtml(d['nav.users']!)}</a>` : ''}
          ${mode === 'settings' ? `<a class="word-btn" href="/insights">${escapeHtml(d['insights.title']!)}</a>` : ''}
          ${mode === 'settings' && asOwner ? `<a class="word-btn st-optional" href="/activity">${escapeHtml(d['users.activityLink']!)}</a>` : ''}
          ${mode === 'settings' ? `<a class="word-btn st-back" href="/" id="back" aria-label="${escapeHtml(d['nav.back']!)}" title="${escapeHtml(d['nav.back']!)}">‹</a>` : ''}
          <button type="button" class="word-btn" id="lang">${escapeHtml(d['lang.face']!)}</button>
          <form method="post" action="/auth/signout" class="st-signout"><button type="submit" class="word-btn" id="signout">${escapeHtml(d['nav.signout']!)}</button></form>
        </div>
      </div>
    </header>
    <div class="st-banner" id="banner" role="status" hidden></div>
    <div class="st-layout ${mode === 'setup' ? 'st-setup' : ''}" id="app" aria-busy="true"></div>
    <p class="version st-version">mailsift ${escapeHtml(version)}</p>
    <div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
    <dialog class="st-dialog" id="dialog"></dialog>
    <script type="application/json" id="boot">${embedJson(bootData)}</script>
    <script nonce="${nonce}">${storeLanguageScript()}\n${SETTINGS_SCRIPT}</script>`, nonce);
}

const SETTINGS_CSS = `
body{min-height:100vh}
.st-header{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--line);padding:env(safe-area-inset-top) 12px 0 16px}
.st-header-inner{display:flex;align-items:center;gap:12px;width:min(1080px,100%);min-height:52px;margin:0 auto}
.st-header .brand{text-decoration:none;color:var(--text)}
.st-crumb{color:var(--muted);font-size:14px;padding-left:12px;border-left:1px solid var(--line)}
.st-header-actions{margin-left:auto;display:flex;align-items:center;gap:2px;min-width:0;overflow-x:auto;scrollbar-width:none}
.st-header-actions::-webkit-scrollbar{display:none}
.st-header-actions .word-btn{text-decoration:none;display:inline-grid;white-space:nowrap;flex:none}
.st-back{font-size:22px;line-height:1;min-width:34px;padding:0 4px}
.st-signout{margin:0;display:contents}
.st-banner{width:min(1080px,calc(100% - 32px));margin:12px auto 0;padding:10px 14px;border-radius:10px;background:var(--accent-tint);color:var(--text);font-size:14px}
.st-banner.warn{background:color-mix(in srgb,var(--warning) 16%,var(--surface))}
.st-banner.ok{background:var(--ok-tint)}
.st-layout{display:grid;grid-template-columns:200px minmax(0,1fr);gap:40px;width:min(1080px,100%);margin:0 auto;padding:24px 16px 48px}
.st-layout.st-setup{grid-template-columns:minmax(0,680px);justify-content:center}
.st-nav{position:sticky;top:76px;align-self:start;display:flex;flex-direction:column;gap:2px}
.st-nav a{display:block;padding:7px 10px;border-radius:8px;color:var(--text-2);text-decoration:none;font-size:14px}
.st-nav a:hover{background:var(--fill);color:var(--text)}
.st-nav a.on{background:var(--fill);color:var(--text);font-weight:600}
.st-main{min-width:0;max-width:720px}
.st-section{padding:8px 0 36px;margin-bottom:28px;border-bottom:1px solid var(--line);scroll-margin-top:72px}
.st-section:last-child{border-bottom:0}
.st-section h2{margin:0 0 4px;font-size:20px;font-weight:600;letter-spacing:-.01em}
.st-section h3{margin:0 0 2px;font-size:15px;font-weight:600}
.st-lede{margin:0 0 20px;color:var(--muted);font-size:14px;max-width:62ch}
.st-form{display:flex;flex-direction:column;gap:18px}
.st-field{display:flex;flex-direction:column;gap:6px}
.st-field>label,.st-label{font-size:14px;font-weight:600;color:var(--text)}
.st-help{margin:0;color:var(--muted);font-size:12.5px;line-height:1.5;max-width:62ch}
.st-error{margin:0;color:var(--critical-text);font-size:12.5px}
.st-input,.st-field input[type=text],.st-field input[type=password],.st-field input[type=url],.st-field input[type=email],.st-field input[type=number],.st-field select,.st-field textarea{
  width:100%;min-height:40px;padding:8px 11px;border:1px solid var(--line-strong);border-radius:8px;background:var(--surface);color:var(--text);font:inherit;font-size:14px}
.st-field textarea{min-height:76px;resize:vertical;line-height:1.5}
.st-field input:focus,.st-field select:focus,.st-field textarea:focus{outline:2px solid var(--accent);outline-offset:-1px;border-color:var(--accent)}
.st-field.bad input,.st-field.bad select,.st-field.bad textarea{border-color:var(--critical)}
.st-field input::placeholder,.st-field textarea::placeholder{color:var(--muted);opacity:.75}
.st-row2{display:grid;grid-template-columns:minmax(0,1fr) 120px;gap:12px}
.st-toggle{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;cursor:pointer}
.st-toggle .st-toggle-text{display:flex;flex-direction:column;gap:4px}
.st-toggle input{appearance:none;-webkit-appearance:none;position:relative;flex:none;width:36px;height:20px;margin:2px 0 0;border-radius:10px;background:var(--switch-off);cursor:pointer;transition:background .12s}
.st-toggle input::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform .2s cubic-bezier(.2,.7,.2,1)}
.st-toggle input:checked{background:var(--accent)}.st-toggle input:checked::after{transform:translateX(16px)}
.st-secret{display:flex;align-items:center;gap:8px}
.st-secret input{flex:1}
.st-pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11.5px;font-weight:600;background:var(--fill);color:var(--muted);white-space:nowrap}
.st-pill.set{background:var(--ok-tint);color:var(--ok)}
.st-pill.warn{background:color-mix(in srgb,var(--warning) 18%,var(--surface));color:var(--warning-text)}
.st-pill.off{background:var(--fill);color:var(--muted)}
.st-link{border:0;background:none;padding:4px 2px;color:var(--accent);font:inherit;font-size:13px;cursor:pointer}
.st-link:hover{text-decoration:underline}
.st-link.danger{color:var(--critical-text)}
.st-more{border-top:1px solid var(--line);padding-top:12px}
.st-more>summary{cursor:pointer;color:var(--text-2);font-size:14px;font-weight:600;list-style:none;display:flex;align-items:center;gap:6px}
.st-more>summary::-webkit-details-marker{display:none}
.st-more>summary::before{content:"";width:6px;height:6px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);transition:transform .15s}
.st-more[open]>summary::before{transform:rotate(45deg)}
.st-more>.st-form{margin-top:18px}
.st-foot{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap;padding-top:4px}
.st-result{margin-right:auto;font-size:13px;color:var(--muted)}
.st-foot .st-btn+.st-result{margin-left:4px}
.st-result.ok{color:var(--ok)}.st-result.bad{color:var(--critical-text)}
.st-btn{min-height:38px;padding:7px 14px;border:1px solid var(--line-strong);border-radius:9px;background:var(--surface);color:var(--text);font:inherit;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap}
.st-btn:hover:not(:disabled){background:var(--fill)}
.st-btn.primary{border-color:var(--accent);background:var(--accent);color:var(--on-accent)}
.st-btn.primary:hover:not(:disabled){filter:brightness(1.07);background:var(--accent)}
.st-btn.danger{color:var(--critical-text)}
.st-btn:disabled{opacity:.5;cursor:default}
.st-mailboxes{list-style:none;margin:0 0 16px;padding:0;border-top:1px solid var(--line)}
.st-mb{display:grid;grid-template-columns:10px minmax(0,1fr) auto;align-items:center;gap:12px;padding:14px 2px;border-bottom:1px solid var(--line)}
.st-dot{width:8px;height:8px;border-radius:50%;background:var(--muted)}
.st-dot.ready{background:var(--ok)}.st-dot.warn{background:var(--warning)}.st-dot.off{background:var(--line-strong)}
.st-mb-name{font-weight:600;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.st-mb-meta{color:var(--muted);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.st-mb-note{font-size:12.5px;margin-top:3px}
.st-mb-note.ok{color:var(--ok)}.st-mb-note.bad{color:var(--critical-text)}
.st-mb-actions{display:flex;align-items:center;gap:6px}
.st-users-main{max-width:820px;width:min(1080px,100%);margin:0 auto;padding:24px 16px 48px}
.st-table{width:100%;border-collapse:collapse;font-size:13.5px;margin:8px 0 12px}
.st-table th{text-align:left;font-size:12px;color:var(--muted);font-weight:600;padding:6px 8px;border-bottom:1px solid var(--line)}
.st-table td{padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}
.st-table td.num{font-variant-numeric:tabular-nums}
.doc-search{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:14px 0 18px}
.doc-search-box{position:relative;display:flex;align-items:center;flex:1 1 280px;min-width:0}
.doc-search-icon{position:absolute;left:13px;width:17px;height:17px;fill:none;stroke:var(--muted);stroke-width:1.8;stroke-linecap:round;pointer-events:none}
.doc-search-box input{width:100%;min-height:42px;padding:9px 14px 9px 40px;border:1px solid var(--line);border-radius:11px;background:var(--fill);color:var(--text);font:inherit;font-size:14px;transition:border-color .12s,box-shadow .12s,background .12s}
.doc-search-box input::placeholder{color:var(--muted)}
.doc-search-box input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-tint);background:var(--surface)}
.doc-bills{flex:0 0 auto;align-items:center;min-height:42px;padding:0 12px;border:1px solid var(--line);border-radius:11px;background:var(--surface)}
.doc-bills .st-label{font-size:13px;color:var(--text-2);line-height:1.2}
.doc-bills input{margin:0}
.doc-tools{display:flex;align-items:center;gap:8px;padding:0 20px 10px;flex-wrap:wrap}
.doc-tool{min-width:38px;min-height:34px;padding:4px 10px;font-size:15px;font-weight:600;text-decoration:none}
.doc-zoom{appearance:none;border:0;background:none;color:var(--text-2);font:inherit;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;min-width:52px;min-height:34px;padding:0 6px;border-radius:8px;cursor:pointer}
.doc-zoom:hover{background:var(--fill)}
.doc-tools .st-spacer{flex:1}
.doc-dialog .st-dialog-head h2{overflow-wrap:anywhere;line-height:1.3}
.doc-viewer{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;max-height:60vh;overflow:auto;padding:8px;border:1px solid var(--line);border-radius:11px;background:var(--fill);-webkit-overflow-scrolling:touch}
.doc-viewer img,.doc-viewer canvas{display:block;width:100%;height:auto;margin:0 auto;border-radius:6px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.14)}
.doc-viewer .st-help{margin:0;padding:24px 18px;text-align:center}
.doc-dialog .st-dialog-body{padding:10px 14px 14px}
.doc-add-item{display:grid;gap:3px;padding:10px 2px;border-bottom:1px solid var(--line)}
.doc-add-item:first-child{border-top:1px solid var(--line)}
.doc-add-meta{color:var(--muted);font-size:12px}
.doc-add-subject{font-weight:600;font-size:14px;line-height:1.35}
.doc-add-item .st-link{padding:3px 0;text-align:left}
.doc-actions .st-btn{flex:0 0 auto}
@media(max-width:700px){
  .doc-dialog{width:calc(100vw - 12px);max-height:calc(100vh - 16px)}
  .doc-dialog .st-dialog-head{padding:12px 14px 4px}
  .doc-dialog .st-dialog-head h2{font-size:16px}
  .doc-tools{padding:0 14px 8px;gap:6px}
  .doc-tool{min-width:40px;min-height:36px;padding:4px 8px}
  .doc-zoom{min-width:46px;min-height:36px}
  .doc-dialog .st-dialog-foot{padding:10px 14px;flex-wrap:wrap}
  .doc-viewer{max-height:56vh;padding:5px;gap:6px}
  .doc-bills{flex:1 1 0}
  .doc-actions{justify-content:stretch;flex-wrap:wrap;gap:8px}
  .doc-actions .st-result{flex:1 1 100%}
  .doc-actions .st-btn{flex:1 1 0;min-width:0}
  #doc-table thead{display:none}
  #doc-table,#doc-table tbody,#doc-table tr,#doc-table td{display:block;width:auto}
  #doc-table tr{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:0 0 10px}
  #doc-table td{border:0;padding:3px 0;display:flex;justify-content:space-between;align-items:baseline;gap:12px;text-align:right}
  #doc-table td::before{content:attr(data-label);color:var(--muted);font-size:12px;font-weight:600;text-align:left;flex:0 0 auto}
  #doc-table td.doc-file{display:block;text-align:left;font-weight:600;font-size:15px;padding:0 0 6px;line-height:1.35;overflow-wrap:anywhere}
  #doc-table td.doc-file::before{content:none}
  #doc-table td:empty{display:none}
  #doc-table td.st-table-actions{display:flex;justify-content:flex-start;flex-wrap:wrap;gap:6px 16px;margin-top:8px;padding-top:9px;border-top:1px solid var(--line);text-align:left}
  #doc-table td.st-table-actions::before{content:none}
  #doc-table td.st-table-actions .st-link{margin:0}
  .st-table-wrap{overflow:visible}
}
.st-table-wrap{overflow-x:auto}
.st-table-actions{white-space:nowrap;text-align:right}
.st-table-actions .st-link{font-size:12.5px;margin-left:10px}
.st-users{list-style:none;margin:0 0 22px;padding:0;display:flex;flex-direction:column;gap:10px}
.st-user{display:grid;grid-template-columns:42px minmax(0,1fr) auto;align-items:center;gap:14px;padding:14px 16px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
.st-user.off{opacity:.66}
.st-avatar{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:var(--accent-tint);color:var(--accent);font-weight:700;font-size:16px;text-transform:uppercase}
.st-user-name{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}
.st-user-name strong{font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.st-user-meta{display:flex;gap:12px;flex-wrap:wrap;margin-top:5px;color:var(--muted);font-size:12.5px;line-height:1.4}
.st-user-meta span{display:inline-flex;align-items:center;gap:4px}
.st-user-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.st-user-actions .st-btn{min-height:32px;padding:4px 10px;font-size:13px;font-weight:500}
.st-empty{color:var(--muted);font-size:14px;padding:18px 16px;border:1px dashed var(--line-strong);border-radius:12px;margin:0;text-align:center}
.st-users-new{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;align-items:end;gap:14px;padding:18px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
.st-users-new .st-field{gap:5px}
.st-users-new .st-foot{padding:0}
.st-user-dialog .st-dialog-body{gap:12px}
.st-user-dialog .st-note{background:var(--fill)}
.st-user-dialog .st-field{margin:0}
.st-users-count{margin:0;color:var(--muted);font-size:13px}
.st-audit{width:100%;border-collapse:collapse;font-size:13.5px}
.st-audit th{text-align:left;color:var(--muted);font-weight:600;font-size:12px;padding:0 10px 8px 0;border-bottom:1px solid var(--line)}
.st-audit td{padding:9px 10px 9px 0;border-bottom:1px solid var(--line);vertical-align:top}
.st-audit td:first-child{white-space:nowrap;color:var(--muted);font-size:12.5px}
.st-audit .ok{color:var(--ok);font-weight:600}
.st-audit .bad{color:var(--critical-text);font-weight:600}
.st-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:0 0 24px}
.st-stat{padding:14px 16px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
.st-stat .n{display:block;font-size:24px;line-height:1.1;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.st-stat .label{display:block;margin-top:5px;color:var(--muted);font-size:12.5px}
.st-bars{display:grid;gap:8px;margin:0 0 22px}
.st-bar-row{display:grid;grid-template-columns:110px minmax(0,1fr) 40px;align-items:center;gap:10px;font-size:13px}
.st-bar-row .name{color:var(--text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.st-bar-track{height:8px;border-radius:99px;background:var(--fill);overflow:hidden}
.st-bar-fill{height:100%;border-radius:99px;background:var(--accent)}
.st-bar-row .n{text-align:right;color:var(--muted);font-variant-numeric:tabular-nums}
.st-sender-list{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}
.st-sender-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 14px;align-items:center;padding:11px 2px;border-bottom:1px solid var(--line);font-size:13.5px}
.st-sender-name{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.st-sender-meta{color:var(--muted);font-size:12px;margin-top:2px}
.st-sender-actions{display:flex;gap:4px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.st-sender-actions .st-btn{min-height:30px;padding:3px 9px;font-size:12.5px}
.st-chip{display:inline-block;padding:3px 9px;border-radius:999px;background:var(--fill);color:var(--text-2);font-size:12px;margin:0 4px 4px 0}
@media (max-width:700px){.st-bar-row{grid-template-columns:86px minmax(0,1fr) 34px}}
@media (max-width:700px){
  .st-users-new{grid-template-columns:minmax(0,1fr)}
  .st-user{grid-template-columns:38px minmax(0,1fr);align-items:start}
  .st-user-actions{grid-column:1 / -1;justify-content:flex-start;padding-left:48px}
}
.st-block{display:flex;flex-direction:column;gap:10px;padding:16px 0;border-top:1px solid var(--line)}
.st-block:first-of-type{border-top:0;padding-top:0}
.st-token{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;padding:10px 0}
.st-code{display:block;padding:9px 11px;border-radius:8px;background:var(--fill);font:13px/1.5 ui-monospace,"SF Mono",Menlo,monospace;word-break:break-all;user-select:all}
.st-inline{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.st-steps{display:flex;gap:6px;list-style:none;margin:0 0 28px;padding:0;counter-reset:step}
.st-steps li{flex:1;display:flex;flex-direction:column;gap:6px;color:var(--muted);font-size:13px;font-weight:600}
.st-steps li::before{content:"";height:3px;border-radius:2px;background:var(--line)}
.st-steps li.done::before,.st-steps li.on::before{background:var(--accent)}
.st-steps li.on{color:var(--text)}
.st-summary{list-style:none;margin:0 0 24px;padding:0;border-top:1px solid var(--line)}
.st-summary li{display:grid;grid-template-columns:140px minmax(0,1fr);gap:12px;padding:12px 2px;border-bottom:1px solid var(--line);font-size:14px}
.st-summary li span:first-child{color:var(--muted)}
.st-folders{display:flex;flex-direction:column;gap:2px;max-height:240px;overflow:auto;padding:6px 8px;border:1px solid var(--line);border-radius:8px}
.st-folders label{display:flex;align-items:center;gap:8px;padding:4px 2px;font-size:14px;cursor:pointer}
.st-folders small{color:var(--muted);font-size:11.5px}
.st-radio{display:flex;flex-direction:column;gap:6px}
.st-radio label{display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer}
.st-dialog{width:min(560px,calc(100vw - 24px));max-height:calc(100vh - 48px);padding:0;border:1px solid var(--line);border-radius:14px;background:var(--surface);color:var(--text);box-shadow:var(--shadow-pop)}
.st-dialog::backdrop{background:var(--backdrop)}
.st-dialog form{display:flex;flex-direction:column;max-height:calc(100vh - 50px)}
.st-dialog-head{padding:18px 20px 6px}
.st-dialog-head h2{margin:0;font-size:18px;font-weight:600}
.st-dialog-body{padding:12px 20px 18px;overflow:auto;display:flex;flex-direction:column;gap:16px}
.st-dialog-foot{display:flex;align-items:center;gap:10px;padding:14px 20px;border-top:1px solid var(--line)}
.st-dialog-foot .st-spacer{flex:1}
.st-note{margin:0;padding:10px 12px;border-radius:8px;background:var(--fill);color:var(--text-2);font-size:13px;line-height:1.5}
.st-version{text-align:center;padding:0 0 24px}
.st-claim{max-width:360px;align-items:stretch;text-align:left;margin-top:10vh}
.st-claim .brand-mark,.st-claim h1,.st-claim .muted{align-self:center;text-align:center}
.st-claim-label{font-size:13px;font-weight:600;margin:10px 0 6px;color:var(--text-2)}
.st-claim input{min-height:46px;border:0;border-radius:10px;background:var(--fill);color:var(--text);padding:10px 14px;font:inherit;font-size:16px}
.st-claim #code{font-family:ui-monospace,"SF Mono",Menlo,monospace;letter-spacing:.06em;text-transform:uppercase}
.st-claim .primary-action{margin-top:18px}
.st-claim .error{color:var(--critical-text);font-size:13px;margin:10px 0 0}
.st-where{margin-top:18px;font-size:13px;color:var(--muted)}
.st-where summary{cursor:pointer}
.st-claim .lang{align-self:center;margin-top:14px;border:0;background:none;color:var(--muted);font:inherit;font-size:13px;cursor:pointer}
@media (max-width:820px){
  .st-layout{grid-template-columns:minmax(0,1fr);gap:8px;padding-top:8px}
  .st-nav{position:static;flex-direction:row;overflow-x:auto;gap:4px;padding-bottom:8px;border-bottom:1px solid var(--line);margin-bottom:12px}
  .st-nav a{white-space:nowrap}
  .st-crumb{display:none}
  .st-mb{grid-template-columns:10px minmax(0,1fr);}
  .st-mb-actions{grid-column:2}
  .st-summary li{grid-template-columns:110px minmax(0,1fr)}
  .st-header-inner{gap:6px}
  .st-header .brand strong{font-size:14px}
  .st-header-actions{gap:0}
  .st-header-actions .word-btn{font-size:12px;padding:0 6px;min-width:0}
  .st-header-actions .st-optional{display:none}
  .st-back{font-size:22px;min-width:32px}
}
`;

/**
 * The page's script. Plain ES2020 in a string: it runs in the browser and is
 * never compiled. Built with DOM calls only, so no value from the server is
 * ever parsed as markup.
 */
// ---------------------------------------------------------------------------
// Users page (owner only)
// ---------------------------------------------------------------------------

export function renderUsersPage(
  lang: Language, nonce: string, version: string,
  users: Array<{
    id: string; username: string; role: string; disabled: boolean; createdAt: string;
    lastLoginAt?: string; failedAttempts?: number; lockedUntil?: number; mailboxCount?: number;
  }>, max: number, currentID: string,
): string {
  const d = dict(lang);
  const s = (key: string): string => escapeHtml(d[key] ?? key);
  const when = (iso: string | undefined): string => {
    if (!iso) return s('users.never');
    const date = new Date(iso);
    if (Number.isNaN(date.valueOf())) return s('users.never');
    return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  };
  const rows = users.map((user) => {
    const owner = user.role === 'owner';
    const locked = Number(user.lockedUntil ?? 0) > Date.now();
    const initial = [...(user.username.trim()[0] ?? '?')][0]!.toUpperCase();
    return `
    <li class="st-user${user.disabled ? ' off' : ''}" data-id="${escapeHtml(user.id)}" data-username="${escapeHtml(user.username)}">
      <span class="st-avatar" aria-hidden="true">${escapeHtml(initial)}</span>
      <div>
        <div class="st-user-name"><strong>${escapeHtml(user.username)}</strong>
          <span class="st-pill${owner ? ' set' : ''}">${escapeHtml(owner ? d['users.owner']! : d['users.member']!)}</span>
          ${user.id === currentID ? `<span class="st-pill">${s('users.you')}</span>` : ''}
          ${user.disabled ? `<span class="st-pill off">${s('users.disabled')}</span>` : ''}
          ${locked ? `<span class="st-pill warn">${s('users.locked').replace('{at}', escapeHtml(when(new Date(Number(user.lockedUntil)).toISOString())))}</span>` : ''}
        </div>
        <div class="st-user-meta">
          <span>${s('users.lastLogin')}: ${escapeHtml(when(user.lastLoginAt))}</span>
          <span>${s('users.created')}: ${escapeHtml(when(user.createdAt))}</span>
          <span>${s('users.mailboxes')}: ${Number(user.mailboxCount ?? 0)}</span>
          ${Number(user.failedAttempts ?? 0) ? `<span>${s('users.failed').replace('{n}', String(user.failedAttempts))}</span>` : ''}
        </div>
      </div>
      <div class="st-user-actions">
        <button type="button" class="st-btn" data-act="rename">${s('users.rename')}</button>
        <button type="button" class="st-btn" data-act="reset">${s('users.reset')}</button>
        ${owner ? '' : `
          <button type="button" class="st-btn" data-act="disable" data-disabled="${user.disabled ? '1' : '0'}">${user.disabled ? s('users.enable') : s('users.disable')}</button>
          <button type="button" class="st-btn danger" data-act="delete">${s('users.delete')}</button>`}
      </div>
    </li>`;
  }).join('');
  const words = {
    rename: d['users.dialogRename']!, reset: d['users.dialogReset']!, delete: d['users.dialogDelete']!,
    deleteBody: d['users.deleteBody']!, cancel: d['users.cancel']!, save: d['users.save']!,
    confirmDelete: d['users.deleteConfirm']!, newUsername: d['users.newUsername']!,
    newPassword: d['users.newPassword']!, passwordHelp: d['users.passwordHelp']!,
  };
  return shell(lang, d['users.title']!, `
    <header class="st-header">
      <div class="st-header-inner">
        <a class="brand" href="/"><img class="brand-mark" src="/icon-192.png?v=3" alt="" aria-hidden="true"><strong>mailsift</strong></a>
        <span class="st-crumb">${s('users.title')}</span>
        <div class="st-header-actions">
          <a class="word-btn" href="/settings">${s('nav.settings')}</a>
          <a class="word-btn st-optional" href="/activity">${s('users.activityLink')}</a>
          <a class="word-btn st-back" href="/" aria-label="${s('nav.back')}" title="${s('nav.back')}">‹</a>
          <button type="button" class="word-btn" id="lang">${s('lang.face')}</button>
          <form method="post" action="/auth/signout" class="st-signout"><button type="submit" class="word-btn">${s('nav.signout')}</button></form>
        </div>
      </div>
    </header>
    <main class="st-main st-users-main">
      <section class="st-section">
        <h2>${s('users.title')}</h2>
        <p class="st-lede">${s('users.lede')}</p>
        <ul class="st-users" id="users">${rows || `<li class="st-empty">${s('users.empty')}</li>`}</ul>
        <p class="st-users-count">${users.length} / ${max} · <a class="st-link" href="/activity">${s('users.activityLink')}</a></p>
      </section>
      <section class="st-section">
        <h2>${s('users.create')}</h2>
        <form class="st-users-new" id="create" novalidate>
          <div class="st-field"><label for="new-username">${s('users.username')}</label>
            <input class="st-input" id="new-username" name="username" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" required></div>
          <div class="st-field"><label for="new-password">${s('users.password')}</label>
            <input class="st-input" id="new-password" name="password" type="password" autocomplete="new-password" minlength="${ADMIN_PASSWORD_MIN}" required
            <p class="st-help">${s('users.passwordHelp').replace('{n}', String(ADMIN_PASSWORD_MIN))}</p></div>
          <div class="st-foot"><span class="st-result" id="create-result" role="status"></span>
            <button type="submit" class="st-btn primary">${s('users.add')}</button></div>
        </form>
      </section>
    </main>
    <dialog class="st-dialog st-user-dialog" id="user-dialog">
      <form method="dialog" id="user-form">
        <div class="st-dialog-head"><h2 id="user-dialog-title"></h2></div>
        <div class="st-dialog-body" id="user-dialog-body"></div>
        <div class="st-dialog-foot"><span class="st-spacer"></span>
          <button type="button" class="st-btn" id="user-cancel">${s('users.cancel')}</button>
          <button type="submit" class="st-btn primary" id="user-submit">${s('users.save')}</button>
        </div>
      </form>
    </dialog>
    <script nonce="${nonce}">${storeLanguageScript()}
    (function () {
      var T = ${JSON.stringify(words).replace(/</g, '\\u003c')};
      var MIN = ${ADMIN_PASSWORD_MIN};
      var $ = function (id) { return document.getElementById(id); };
      var dialog = $('user-dialog'), form = $('user-form'), body = $('user-dialog-body');
      var action = '', target = '';
      function api(path, data) {
        return fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(data || {}) })
          .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || 'failed'); return d; }); });
      }
      function field(label, id, type, value, help) {
        body.innerHTML = '<label class="st-field"><span class="st-label">' + label + '</span>' +
          '<input class="st-input" id="' + id + '" type="' + type + '" value="' + value.replace(/"/g, '&quot;') + '" autocomplete="' + (type === 'password' ? 'new-password' : 'off') + '" spellcheck="false">' +
          (help ? '<span class="st-help">' + help + '</span>' : '') + '</label>';
        var input = $(id); if (input) { input.focus(); input.select(); }
        return input;
      }
      function open(act, row) {
        action = act; target = row.dataset.id;
        var username = row.dataset.username;
        if (act === 'rename') {
          $('user-dialog-title').textContent = T.rename;
          field(T.newUsername, 'user-value', 'text', username, '');
          $('user-submit').textContent = T.save; $('user-submit').className = 'st-btn primary';
        } else if (act === 'reset') {
          $('user-dialog-title').textContent = T.reset + ' · ' + username;
          field(T.newPassword, 'user-value', 'password', '', T.passwordHelp.replace('{n}', MIN));
          $('user-submit').textContent = T.save; $('user-submit').className = 'st-btn primary';
        } else {
          $('user-dialog-title').textContent = T.delete;
          body.innerHTML = '<p class="st-note">' + T.deleteBody.replace('{name}', '<strong>' + username.replace(/</g, '&lt;') + '</strong>') + '</p>';
          $('user-submit').textContent = T.confirmDelete; $('user-submit').className = 'st-btn danger';
        }
        dialog.showModal();
      }
      document.querySelectorAll('[data-act]').forEach(function (button) {
        button.addEventListener('click', function () {
          var row = button.closest('[data-id]');
          if (button.dataset.act === 'disable') {
            api('/api/admin/users/disable', { id: row.dataset.id, disabled: button.dataset.disabled !== '1' })
              .then(function () { location.reload(); })
              .catch(function (error) { alert(error.message); });
            return;
          }
          open(button.dataset.act, row);
        });
      });
      $('user-cancel').addEventListener('click', function () { dialog.close(); });
      form.addEventListener('submit', async function (event) {
        event.preventDefault();
        var value = $('user-value') ? $('user-value').value : '';
        var path = action === 'rename' ? '/api/admin/users/rename'
          : action === 'reset' ? '/api/admin/users/reset'
          : action === 'delete' ? '/api/admin/users/delete'
          : '/api/admin/users/disable';
        var data = action === 'rename' ? { id: target, username: value }
          : action === 'reset' ? { id: target, password: value }
          : action === 'delete' ? { id: target }
          : { id: target, disabled: false };
        try {
          $('user-submit').disabled = true;
          await api(path, data);
          location.reload();
        } catch (error) {
          $('user-submit').disabled = false;
          var note = body.querySelector('.st-note');
          if (!note) { note = document.createElement('p'); note.className = 'st-note'; body.appendChild(note); }
          note.textContent = error.message;
        }
      });
      $('create').addEventListener('submit', async function (event) {
        event.preventDefault();
        var result = $('create-result'); result.textContent = ''; result.className = 'st-result';
        try {
          await api('/api/admin/users/create', { username: $('new-username').value, password: $('new-password').value });
          location.reload();
        } catch (error) { result.textContent = error.message; result.className = 'st-result bad'; }
      });
    })();</script>`, nonce);
}

/** The owner's audit trail: who signed in, changed settings, or touched users. */
export function renderAuditPage(
  lang: Language, nonce: string, version: string,
  events: Array<{ id: number; at: string; actor: string | null; action: string; target: string | null; success: boolean; detail: string | null }>,
): string {
  const d = dict(lang);
  const s = (key: string): string => escapeHtml(d[key] ?? key);
  const when = (iso: string): string => {
    const date = new Date(iso);
    return Number.isNaN(date.valueOf()) ? iso
      : new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  };
  const rows = events.map((event) => `
    <tr>
      <td>${escapeHtml(when(event.at))}</td>
      <td>${escapeHtml(event.actor ?? '—')}</td>
      <td>${escapeHtml(event.action)}</td>
      <td>${escapeHtml(event.target ?? '—')}${event.detail ? `<div class="st-help">${escapeHtml(event.detail)}</div>` : ''}</td>
      <td class="${event.success ? 'ok' : 'bad'}">${s(event.success ? 'activity.ok' : 'activity.failed')}</td>
    </tr>`).join('');
  return shell(lang, d['activity.title']!, `
    <header class="st-header">
      <div class="st-header-inner">
        <a class="brand" href="/"><img class="brand-mark" src="/icon-192.png?v=3" alt="" aria-hidden="true"><strong>mailsift</strong></a>
        <span class="st-crumb">${s('activity.title')}</span>
        <div class="st-header-actions">
          <a class="word-btn" href="/users">${s('users.title')}</a>
          <a class="word-btn" href="/settings">${s('nav.settings')}</a>
          <a class="word-btn st-back" href="/" aria-label="${s('nav.back')}" title="${s('nav.back')}">‹</a>
          <button type="button" class="word-btn" id="lang">${s('lang.face')}</button>
          <form method="post" action="/auth/signout" class="st-signout"><button type="submit" class="word-btn">${s('nav.signout')}</button></form>
        </div>
      </div>
    </header>
    <main class="st-main st-users-main">
      <section class="st-section">
        <h2>${s('activity.title')}</h2>
        <p class="st-lede">${s('activity.lede')}</p>
        ${events.length ? `<div style="overflow:auto"><table class="st-audit">
          <thead><tr><th>${s('activity.when')}</th><th>${s('activity.who')}</th><th>${s('activity.what')}</th><th>${s('activity.target')}</th><th>${s('activity.result')}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>` : `<p class="st-empty">${s('activity.empty')}</p>`}
      </section>
    </main>`, nonce);
}

/** Per-person triage quality, spend and subscription clean-up. */
export function renderInsightsPage(
  lang: Language, nonce: string, version: string, insights: Insights,
): string {
  const d = dict(lang);
  const s = (key: string): string => escapeHtml(d[key] ?? key);
  const when = (iso: string | undefined): string => {
    if (!iso) return s('insights.never');
    const date = new Date(iso);
    return Number.isNaN(date.valueOf()) ? s('insights.never')
      : new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(date);
  };
  const max = (items: Array<{ n: number }>): number => Math.max(1, ...items.map((item) => item.n));
  const bars = (items: Array<{ name: string; n: number }>): string => {
    const top = max(items);
    return items.length ? `<div class="st-bars">${items.map((item) => `
      <div class="st-bar-row"><span class="name">${escapeHtml(item.name || '—')}</span>
        <span class="st-bar-track"><span class="st-bar-fill" style="width:${Math.max(2, Math.round(item.n / top * 100))}%"></span></span>
        <span class="n">${item.n}</span></div>`).join('')}</div>` : '';
  };
  const senderRows = insights.subscriptions.map((row) => `
    <li class="st-sender-item">
      <div><div class="st-sender-name">${escapeHtml(row.name || row.sender)}</div>
        <div class="st-sender-meta">${escapeHtml(row.sender)} · ${s('insights.count').replace('{n}', String(row.count))} · ${s('insights.last').replace('{at}', escapeHtml(when(row.lastAt)))}</div></div>
      <div class="st-sender-actions">
        ${row.unsubscribeUrl ? `<a class="st-btn" href="${escapeHtml(row.unsubscribeUrl)}" target="_blank" rel="noopener noreferrer nofollow">${s('insights.unsubscribe')}</a>` : ''}
        <button type="button" class="st-btn" data-mute="${escapeHtml(row.sender)}">${s('insights.mute')}</button>
      </div>
    </li>`).join('');
  const cost = insights.usage.costTicks ? `$${(insights.usage.costTicks / 1e10).toFixed(4)}` : '—';
  const feedback = Object.entries(insights.feedback).map(([label, n]) => `${escapeHtml(label)} ${n}`).join(' · ');
  return shell(lang, d['insights.title']!, `
    <header class="st-header">
      <div class="st-header-inner">
        <a class="brand" href="/"><img class="brand-mark" src="/icon-192.png?v=3" alt="" aria-hidden="true"><strong>mailsift</strong></a>
        <span class="st-crumb">${s('insights.title')}</span>
        <div class="st-header-actions">
          <a class="word-btn" href="/settings">${s('nav.settings')}</a>
          <a class="word-btn st-optional" href="/activity">${s('users.activityLink')}</a>
          <a class="word-btn st-back" href="/" aria-label="${s('nav.back')}" title="${s('nav.back')}">‹</a>
          <button type="button" class="word-btn" id="lang">${s('lang.face')}</button>
          <form method="post" action="/auth/signout" class="st-signout"><button type="submit" class="word-btn">${s('nav.signout')}</button></form>
        </div>
      </div>
    </header>
    <main class="st-main st-users-main">
      <section class="st-section">
        <h2>${s('insights.title')}</h2>
        <p class="st-lede">${s('insights.lede')} <span class="st-help">${s('insights.intro').replace('{days}', String(insights.days))}</span></p>
        <div class="st-stats">
          <div class="st-stat"><span class="n">${insights.total}</span><span class="label">${s('insights.messages')}</span></div>
          <div class="st-stat"><span class="n">${insights.tasks.open}</span><span class="label">${s('insights.tasks')}</span></div>
          <div class="st-stat"><span class="n">${insights.tasks.due}</span><span class="label">${s('insights.due')}</span></div>
          <div class="st-stat"><span class="n">${insights.usage.tokens.toLocaleString(lang)}</span><span class="label">${s('insights.tokens')}</span></div>
          <div class="st-stat"><span class="n">${cost}</span><span class="label">${s('insights.cost')}</span></div>
        </div>
      </section>
      <section class="st-section"><h3>${s('insights.importance')}</h3>${bars(insights.byImportance)}</section>
      <section class="st-section"><h3>${s('insights.source')}</h3>${bars(insights.bySource)}</section>
      <section class="st-section"><h3>${s('insights.category')}</h3>${bars(insights.byCategory)}</section>
      <section class="st-section">
        <h3>${s('insights.senders')}</h3>
        <ul class="st-sender-list">${insights.topSenders.map((row) => `<li class="st-sender-item">
          <div><div class="st-sender-name">${escapeHtml(row.name || row.sender)}</div><div class="st-sender-meta">${escapeHtml(row.sender)} · ${row.n}</div></div>
        </li>`).join('') || `<li class="st-empty">${s('insights.subscriptionsEmpty')}</li>`}</ul>
      </section>
      <section class="st-section">
        <h3>${s('insights.subscriptions')}</h3>
        <ul class="st-sender-list">${senderRows || `<li class="st-empty">${s('insights.subscriptionsEmpty')}</li>`}</ul>
      </section>
      <section class="st-section">
        <h3>${s('insights.suggested')}</h3>
        ${insights.suggestedMute.length
          ? insights.suggestedMute.map((sender) => `<span class="st-chip">${escapeHtml(sender)}</span>`).join('')
          : `<p class="st-help">${s('insights.suggestedEmpty')}</p>`}
        ${feedback ? `<p class="st-help">${s('insights.feedback')}: ${feedback}</p>` : ''}
      </section>
    </main>
    <script nonce="${nonce}">${storeLanguageScript()}
    document.querySelectorAll('[data-mute]').forEach(function (button) {
      button.addEventListener('click', async function () {
        button.disabled = true;
        try {
          var response = await fetch('/api/admin/insights/mute', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            credentials: 'same-origin', body: JSON.stringify({ sender: button.dataset.mute }),
          });
          if (!response.ok) throw new Error((await response.json().catch(function () { return {}; })).error || 'failed');
          button.textContent = ${JSON.stringify(d['insights.muted']).replace(/</g, '\\u003c')};
        } catch (error) { button.disabled = false; alert(error.message); }
      });
    });</script>`, nonce);
}


export interface SyncReport {
  lastPollAt: string;
  lookback: string;
  mailboxes: Array<{ username: string; name: string; folders: string[]; readiness: string }>;
  cursors: Array<{ account: string; folder: string; lastUid: number; updatedAt: string }>;
  counts: Array<{ account: string; folder: string; count: number; oldest: string | null; newest: string | null }>;
  dead: Array<{ subject: string; reason: string; createdAt: string }>;
}

const when = (value: string): string => (value ? value.replace('T', ' ').slice(0, 16) : '—');

export function renderSyncPage(lang: Language, nonce: string, version: string, report: SyncReport): string {
  const d = dict(lang);
  const s = (key: string): string => escapeHtml(d[key] ?? key);
  const fill = (key: string, value: string): string => escapeHtml((d[key] ?? key).replace('{n}', value));
  const mailboxRows = report.mailboxes.map((mailbox) => `
    <tr><td>${escapeHtml(mailbox.name || mailbox.username)}<br><small class="muted">${escapeHtml(mailbox.username)}</small></td>
      <td>${mailbox.folders.length ? escapeHtml(mailbox.folders.join(', ')) : s('sync.defaultFolders')}</td>
      <td>${escapeHtml(mailbox.readiness)}</td></tr>`).join('');
  const cursorRows = report.cursors.map((cursor) => `
    <tr><td>${escapeHtml(cursor.account)}</td><td>${escapeHtml(cursor.folder)}</td>
      <td class="num">${cursor.lastUid}</td><td>${escapeHtml(when(cursor.updatedAt))}</td></tr>`).join('');
  const countRows = report.counts.map((row) => `
    <tr><td>${escapeHtml(row.account)}</td><td>${escapeHtml(row.folder)}</td>
      <td class="num">${row.count}</td><td>${escapeHtml(when(row.oldest ?? ''))}</td><td>${escapeHtml(when(row.newest ?? ''))}</td></tr>`).join('');
  const deadRows = report.dead.length ? report.dead.map((row) => `
    <tr><td>${escapeHtml(row.subject || '—')}</td><td>${escapeHtml(row.reason)}</td><td>${escapeHtml(when(row.createdAt))}</td></tr>`).join('')
    : `<tr><td colspan="3">${s('sync.deadNone')}</td></tr>`;
  const options = report.mailboxes.map((mailbox) => `<option value="${escapeHtml(mailbox.username)}">${escapeHtml(mailbox.name || mailbox.username)}</option>`).join('');
  return shell(lang, d['sync.title']!, `
    <header class="st-header">
      <div class="st-header-inner">
        <a class="brand" href="/"><img class="brand-mark" src="/icon-192.png?v=3" alt="" aria-hidden="true"><strong>mailsift</strong></a>
        <span class="st-crumb">${s('sync.title')}</span>
        <div class="st-header-actions">
          <a class="word-btn" href="/settings">${s('nav.settings')}</a>
          <a class="word-btn st-back" href="/" aria-label="${s('nav.back')}" title="${s('nav.back')}">‹</a>
          <button type="button" class="word-btn" id="lang">${s('lang.face')}</button>
          <form method="post" action="/auth/signout" class="st-signout"><button type="submit" class="word-btn">${s('nav.signout')}</button></form>
        </div>
      </div>
    </header>
    <main class="st-main st-users-main">
      <section class="st-section">
        <h2>${s('sync.title')}</h2>
        <p class="st-lede">${s('sync.lede')}</p>
        <p class="st-help">${s('sync.lastCheck')}: <strong>${escapeHtml(when(report.lastPollAt) || s('sync.never'))}</strong></p>
        <p class="st-help">${fill('sync.window', report.lookback)}</p>
      </section>
      <section class="st-section">
        <h2>${s('sync.searchTitle')}</h2>
        <p class="st-help">${s('sync.searchHint')}</p>
        <form class="st-form" id="sync-search">
          <div class="st-row2">
            <div class="st-field"><label for="sync-mailbox">${s('sync.mailbox')}</label><select id="sync-mailbox">${options}</select></div>
            <div class="st-field"><label for="sync-query">${s('sync.query')}</label>
              <input id="sync-query" type="search" placeholder="${s('sync.queryPlaceholder')}" autocomplete="off" spellcheck="false"></div>
          </div>
          <div class="st-foot"><span class="st-result" id="sync-result"></span><button type="submit" class="st-btn primary">${s('sync.search')}</button></div>
        </form>
        <div id="sync-hits"></div>
      </section>
      <section class="st-section">
        <h2>${s('sync.watching')}</h2>
        <table class="st-table">
          <thead><tr><th>${s('sync.mailbox')}</th><th>${s('sync.folders')}</th><th>${s('sync.stored')}</th></tr></thead>
          <tbody>${mailboxRows || `<tr><td colspan="3">${s('sync.noResults')}</td></tr>`}</tbody>
        </table>
        <p class="st-help">${s('sync.archivedNote')}</p>
        <p class="st-help">${s('sync.accountsNote')}</p>
      </section>
      <section class="st-section">
        <h2>${s('sync.folder')}</h2>
        <table class="st-table">
          <thead><tr><th>${s('sync.account')}</th><th>${s('sync.folder')}</th><th>${s('sync.lastUid')}</th><th>${s('sync.updated')}</th></tr></thead>
          <tbody>${cursorRows || `<tr><td colspan="4">${s('sync.noResults')}</td></tr>`}</tbody>
        </table>
      </section>
      <section class="st-section">
        <h2>${s('sync.stored')}</h2>
        <table class="st-table">
          <thead><tr><th>${s('sync.account')}</th><th>${s('sync.folder')}</th><th>${s('sync.stored')}</th><th>${s('sync.date')}</th><th></th></tr></thead>
          <tbody>${countRows || `<tr><td colspan="5">${s('sync.noResults')}</td></tr>`}</tbody>
        </table>
      </section>
      <section class="st-section">
        <h2>${s('sync.dead')}</h2>
        <table class="st-table">
          <thead><tr><th>${s('sync.subject')}</th><th></th><th>${s('sync.date')}</th></tr></thead>
          <tbody>${deadRows}</tbody>
        </table>
      </section>
    </main>
    <script nonce="${nonce}">${storeLanguageScript()}
    (function () {
      var form = document.getElementById('sync-search');
      var result = document.getElementById('sync-result');
      var hits = document.getElementById('sync-hits');
      var labels = {
        from: ${JSON.stringify(s('sync.from'))},
        subject: ${JSON.stringify(s('sync.subject'))},
        date: ${JSON.stringify(s('sync.date'))},
        folder: ${JSON.stringify(s('sync.folder'))},
        foundIn: ${JSON.stringify(s('sync.foundIn'))},
        none: ${JSON.stringify(s('sync.noResults'))},
        searching: ${JSON.stringify(s('sync.searching'))},
        pdf: ${JSON.stringify(s('sync.pdf'))},
        savePdf: ${JSON.stringify(s('sync.savePdf'))},
        saved: ${JSON.stringify(s('sync.savedPdf'))},
        pdfFailed: ${JSON.stringify(s('sync.pdfFailed'))},
      };
      function table(items) {
        var table = document.createElement('table');
        table.className = 'st-table';
        var head = document.createElement('thead');
        var hr = document.createElement('tr');
        [labels.date, labels.from, labels.subject, labels.folder, labels.pdf].forEach(function (text) {
          var th = document.createElement('th'); th.textContent = text; hr.appendChild(th);
        });
        head.appendChild(hr); table.appendChild(head);
        var body = document.createElement('tbody');
        items.forEach(function (item) {
          var tr = document.createElement('tr');
          [item.date || '', (item.from && (item.from.name || item.from.address)) || '', item.subject || '', item.folder || ''].forEach(function (text) {
            var td = document.createElement('td'); td.textContent = text; tr.appendChild(td);
          });
          var pdfCell = document.createElement('td');
          var save = document.createElement('button');
          save.type = 'button'; save.className = 'st-btn'; save.textContent = labels.savePdf;
          save.onclick = async function () {
            save.disabled = true;
            try {
              var response = await fetch('/api/documents/from-live', {
                method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin',
                body: JSON.stringify({
                  handle: item.handle, subject: item.subject,
                  from: item.from && item.from.address, date: item.date,
                }),
              });
              var data = await response.json().catch(function () { return {}; });
              if (!response.ok) throw new Error(data.error || 'failed');
              save.textContent = labels.saved.replace('{n}', String(data.indexed || 0)).replace('{m}', String(data.failed || 0));
            } catch (error) {
              save.textContent = labels.pdfFailed;
              save.title = error.message;
            }
            save.disabled = false;
          };
          pdfCell.appendChild(save);
          tr.appendChild(pdfCell);
          body.appendChild(tr);
        });
        table.appendChild(body);
        return table;
      }
      form.onsubmit = async function (event) {
        event.preventDefault();
        hits.textContent = '';
        result.className = 'st-result';
        result.textContent = labels.searching;
        try {
          var response = await fetch('/api/sync/search', {
            method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin',
            body: JSON.stringify({ mailbox: document.getElementById('sync-mailbox').value, query: document.getElementById('sync-query').value }),
          });
          var data = await response.json().catch(function () { return {}; });
          if (!response.ok) throw new Error(data.error || 'failed');
          result.textContent = data.items.length
            ? labels.foundIn + ': ' + (data.folders || []).join(', ')
            : labels.none;
          if (data.items.length) hits.appendChild(table(data.items));
        } catch (error) {
          result.className = 'st-result bad';
          result.textContent = error.message;
        }
      };
    })();</script>`, nonce);
}

export function renderDocumentsPage(
  lang: Language, nonce: string, version: string, user: { username: string; role: string },
  mailboxes: Array<{ username: string; name: string }> = [],
): string {
  const d = dict(lang);
  const s = (key: string): string => escapeHtml(d[key] ?? key);
  return shell(lang, d['docs.title']!, `
    <header class="st-header">
      <div class="st-header-inner">
        <a class="brand" href="/"><img class="brand-mark" src="/icon-192.png?v=3" alt="" aria-hidden="true"><strong>mailsift</strong></a>
        <span class="st-crumb">${s('docs.title')} · ${escapeHtml(user.username)}</span>
        <div class="st-header-actions">
          <a class="word-btn" href="/settings">${s('nav.settings')}</a>
          <a class="word-btn st-back" href="/" aria-label="${s('nav.back')}" title="${s('nav.back')}">‹</a>
          <button type="button" class="word-btn" id="lang">${s('lang.face')}</button>
          <form method="post" action="/auth/signout" class="st-signout"><button type="submit" class="word-btn">${s('nav.signout')}</button></form>
        </div>
      </div>
    </header>
    <main class="st-main st-users-main">
      <section class="st-section">
        <h2>${s('docs.title')}</h2>
        <p class="st-lede">${s('docs.lede')}</p>
        <p class="st-help">${s('docs.passwordHint')}</p>
        <div class="st-foot doc-actions">
          <span class="st-result" id="doc-status"></span>
          <button type="button" class="st-btn" id="doc-retry">${s('docs.retry')}</button>
          <button type="button" class="st-btn" id="doc-index">${s('docs.index')}</button>
        </div>
      </section>
      <section class="st-section">
        <form class="doc-search" id="doc-search" role="search">
          <label class="doc-search-box">
            <svg class="doc-search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>
            <input id="doc-q" type="search" placeholder="${s('docs.searchPlaceholder')}" aria-label="${s('docs.searchPlaceholder')}" autocomplete="off" spellcheck="false">
          </label>
          <label class="st-toggle doc-bills"><span class="st-label">${s('docs.onlyBills')}</span><input type="checkbox" id="doc-bills" role="switch"></label>
          <label class="st-toggle doc-bills"><span class="st-label">${s('docs.showDismissed')}</span><input type="checkbox" id="doc-dismissed" role="switch"></label>
        </form>
        <details class="st-more" id="add-message">
          <summary>${s('docs.addTitle')}</summary>
          <div class="st-form">
            <p class="st-help">${s('docs.addHint')}</p>
            <div class="st-row2">
              <div class="st-field"><label for="add-mailbox">${s('docs.mailbox')}</label>
                <select id="add-mailbox">${mailboxes.map((mailbox) => `<option value="${escapeHtml(mailbox.username)}">${escapeHtml(mailbox.name || mailbox.username)}</option>`).join('')}</select></div>
              <div class="st-field"><label for="add-query">${s('docs.searchSubject')}</label>
                <input id="add-query" type="search" placeholder="${s('docs.searchSubjectHint')}" autocomplete="off" spellcheck="false"></div>
            </div>
            <div class="st-foot"><span class="st-result" id="add-result"></span><button type="button" class="st-btn" id="add-search">${s('docs.searchMailbox')}</button></div>
            <div id="add-hits"></div>
          </div>
        </details>
        <div class="st-table-wrap">
          <table class="st-table" id="doc-table">
            <thead><tr>
              <th>${s('docs.name')}</th><th>${s('docs.subject')}</th><th>${s('docs.sender')}</th>
              <th>${s('docs.date')}</th><th>${s('docs.pages')}</th><th>${s('docs.amount')}</th><th>${s('docs.due')}</th><th></th>
            </tr></thead>
            <tbody><tr><td colspan="8">${s('docs.none')}</td></tr></tbody>
          </table>
        </div>
      </section>
    </main>
    <dialog class="st-dialog" id="doc-dialog">
      <form method="dialog">
        <div class="st-dialog-head"><h2 id="doc-dialog-title"></h2></div>
        <div class="st-dialog-body"><pre class="st-code" id="doc-dialog-text" style="white-space:pre-wrap;max-height:60vh;overflow:auto"></pre></div>
        <div class="st-dialog-foot"><span class="st-spacer"></span><button class="st-btn primary" value="close">${s('docs.close')}</button></div>
      </form>
    </dialog>
    <dialog class="st-dialog doc-dialog" id="pdf-dialog">
      <div class="st-dialog-head"><h2 id="pdf-title"></h2></div>
      <div class="doc-tools" role="toolbar" aria-label="${s('docs.zoom')}">
        <button type="button" class="st-btn doc-tool" id="pdf-zoom-out" aria-label="${s('docs.zoomOut')}" title="${s('docs.zoomOut')}">−</button>
        <button type="button" class="doc-zoom" id="pdf-zoom-reset" title="${s('docs.fit')}" aria-label="${s('docs.fit')}">100%</button>
        <button type="button" class="st-btn doc-tool" id="pdf-zoom-in" aria-label="${s('docs.zoomIn')}" title="${s('docs.zoomIn')}">+</button>
        <span class="st-spacer"></span>
        <a class="st-btn doc-tool" id="pdf-download" download>${s('docs.download')}</a>
      </div>
      <div class="st-dialog-body"><div class="doc-viewer" id="pdf-pages"></div></div>
      <div class="st-dialog-foot">
        <a class="st-btn" id="pdf-tab" target="_blank" rel="noopener">${s('docs.openTab')}</a>
        <span class="st-spacer"></span>
        <button type="button" class="st-btn primary" id="pdf-close">${s('docs.close')}</button>
      </div>
    </dialog>
    <dialog class="st-dialog" id="email-dialog">
      <div class="st-dialog-head"><h2 id="email-title">${s('docs.emailTitle')}</h2></div>
      <div class="st-dialog-body">
        <p class="st-help" id="email-meta"></p>
        <pre class="st-code" id="email-text" style="white-space:pre-wrap;max-height:55vh;overflow:auto"></pre>
      </div>
      <div class="st-dialog-foot"><span class="st-spacer"></span><button type="button" class="st-btn primary" id="email-close">${s('docs.close')}</button></div>
    </dialog>
    <dialog class="st-dialog" id="unlock-dialog">
      <div class="st-dialog-head"><h2>${s('docs.unlockTitle')}</h2></div>
      <div class="st-dialog-body">
        <p class="st-help">${s('docs.unlockHelp')}</p>
        <div class="st-field"><label for="unlock-password">${s('docs.password')}</label>
          <input id="unlock-password" type="password" autocomplete="off" spellcheck="false"></div>
        <label class="st-toggle"><span class="st-toggle-text"><span class="st-label">${s('docs.remember')}</span><span class="st-help" id="unlock-sender"></span></span><input type="checkbox" id="unlock-remember" checked></label>
        <p class="st-result" id="unlock-result"></p>
      </div>
      <div class="st-dialog-foot">
        <button type="button" class="st-btn" id="unlock-cancel">${s('docs.cancel')}</button>
        <span class="st-spacer"></span>
        <button type="button" class="st-btn primary" id="unlock-submit">${s('docs.unlockSubmit')}</button>
      </div>
    </dialog>
    <script nonce="${nonce}">${storeLanguageScript()}
    (function () {
      var $ = function (id) { return document.getElementById(id); };
      var labels = {
        none: ${JSON.stringify(s('docs.none'))},
        locked: ${JSON.stringify(s('docs.locked'))},
        noText: ${JSON.stringify(s('docs.noText'))},
        indexed: ${JSON.stringify(s('docs.indexed'))},
        left: ${JSON.stringify(s('docs.left'))},
        indexing: ${JSON.stringify(s('docs.indexing'))},
        pdf: ${JSON.stringify(s('docs.pdf'))},
        pdfFailed: ${JSON.stringify(s('docs.pdfFailed'))},
        loadingPdf: ${JSON.stringify(s('docs.loadingPdf'))},
        text: ${JSON.stringify(s('docs.text'))},
        unlock: ${JSON.stringify(s('docs.unlock'))},
        unlocking: ${JSON.stringify(s('docs.unlocking'))},
        wrong: ${JSON.stringify(s('docs.wrongPassword'))},
        rememberFor: ${JSON.stringify(s('docs.rememberFor'))},
        email: ${JSON.stringify(s('docs.email'))},
        emailTitle: ${JSON.stringify(s('docs.emailTitle'))},
        emailMissing: ${JSON.stringify(s('docs.emailMissing'))},
        ai: ${JSON.stringify(s('docs.ai'))},
        analyzing: ${JSON.stringify(s('docs.analyzing'))},
        aiNone: ${JSON.stringify(s('docs.aiNone'))},
        dismiss: ${JSON.stringify(s('docs.dismiss'))},
        restore: ${JSON.stringify(s('docs.restore'))},
        dismissed: ${JSON.stringify(s('docs.dismissed'))},
        addPdfs: ${JSON.stringify(s('docs.addPdfs'))},
        date: ${JSON.stringify(s('docs.date'))},
        sender: ${JSON.stringify(s('docs.sender'))},
        subject: ${JSON.stringify(s('docs.subject'))},
        folder: ${JSON.stringify(s('docs.folder'))},
        pages: ${JSON.stringify(s('docs.pages'))},
        amount: ${JSON.stringify(s('docs.amount'))},
        due: ${JSON.stringify(s('docs.due'))},
        addDone: ${JSON.stringify(s('docs.addDone'))},
      };
      function cell(text, className, label) {
        var td = document.createElement('td');
        if (className) td.className = className;
        if (label) td.setAttribute('data-label', label);
        td.textContent = text == null ? '' : String(text);
        return td;
      }
      function show(document) {
        var dialog = $('doc-dialog');
        $('doc-dialog-title').textContent = document.name || document.subject || '';
        $('doc-dialog-text').textContent = document.text || labels.noText;
        dialog.showModal();
      }
      var unlockTarget = null;
      var pdfRun = 0;
      var pdfTask = null;
      var pdfjsPromise = null;
      var pdfView = null;
      var ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5];
      function pdfParams(docItem) {
        return 'key=' + encodeURIComponent(docItem.dedupKey) + '&part=' + encodeURIComponent(docItem.partId);
      }
      /**
       * PDF.js, loaded once from this server. Its module is not part of the
       * page bundle, so it is imported on the first preview and kept after.
       */
      function loadPdfjs() {
        if (!pdfjsPromise) {
          pdfjsPromise = import('/assets/pdfjs/pdf.mjs').then(function (pdfjs) {
            pdfjs.GlobalWorkerOptions.workerSrc = '/assets/pdfjs/pdf.worker.mjs';
            return pdfjs;
          });
          pdfjsPromise.catch(function () { pdfjsPromise = null; });
        }
        return pdfjsPromise;
      }
      function setZoomControls(active) {
        var scale = pdfView ? pdfView.scale : 1;
        var index = ZOOM_STEPS.indexOf(scale);
        if (index < 0) index = ZOOM_STEPS.indexOf(1);
        $('pdf-zoom-out').disabled = !active || index <= 0;
        $('pdf-zoom-in').disabled = !active || index >= ZOOM_STEPS.length - 1;
        $('pdf-zoom-reset').disabled = !active;
        $('pdf-zoom-reset').textContent = Math.round(scale * 100) + '%';
      }
      function clearPdf() {
        pdfRun += 1;
        pdfView = null;
        if (pdfTask) {
          try { pdfTask.destroy(); } catch (error) { /* already gone */ }
          pdfTask = null;
        }
        $('pdf-pages').textContent = '';
        setZoomControls(false);
      }
      function closePdf() { var dialog = $('pdf-dialog'); if (dialog.open) dialog.close(); }
      $('pdf-close').onclick = closePdf;
      $('pdf-dialog').addEventListener('close', clearPdf);

      /**
       * Render the decrypted PDF in the page itself with PDF.js. A browser's
       * own PDF plugin cannot be relied on inside a dialog and its iframe is
       * blank on several phones; a canvas works everywhere.
       */
      /**
       * Every page is rendered again at the chosen size rather than stretched
       * with CSS, so zooming in makes the text sharper, not blurrier. Past
       * 100% the page is wider than the dialog and can be panned.
       */
      async function paintPdf() {
        var view = pdfView;
        if (!view) return false;
        var serial = ++view.serial;
        var box = $('pdf-pages');
        var keep = box.scrollHeight > box.clientHeight
          ? box.scrollTop / (box.scrollHeight - box.clientHeight) : 0;
        setZoomControls(false);
        try {
          for (var i = 0; i < view.pages.length; i += 1) {
            if (view !== pdfView || view.serial !== serial) return false;
            var item = view.pages[i];
            var base = item.page.getViewport({ scale: 1 });
            var viewport = item.page.getViewport({ scale: (view.width * view.dpr * view.scale) / base.width });
            item.canvas.width = Math.floor(viewport.width);
            item.canvas.height = Math.floor(viewport.height);
            item.canvas.style.width = (view.scale * 100) + '%';
            item.canvas.style.height = 'auto';
            var context = item.canvas.getContext('2d');
            if (!context) throw new Error('canvas');
            await item.page.render({ canvasContext: context, viewport: viewport }).promise;
          }
          if (view !== pdfView || view.serial !== serial) return false;
          box.scrollTop = keep * Math.max(0, box.scrollHeight - box.clientHeight);
          setZoomControls(true);
          return true;
        } catch (error) {
          if (view !== pdfView || view.serial !== serial) return false;
          setZoomControls(true);
          return false;
        }
      }

      async function zoomTo(scale) {
        if (!pdfView) return;
        pdfView.scale = scale;
        $('pdf-zoom-reset').textContent = Math.round(scale * 100) + '%';
        await paintPdf();
      }
      function stepZoom(direction) {
        if (!pdfView) return;
        var index = ZOOM_STEPS.indexOf(pdfView.scale);
        if (index < 0) index = ZOOM_STEPS.indexOf(1);
        var next = ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, index + direction))];
        if (next !== pdfView.scale) zoomTo(next);
      }
      $('pdf-zoom-out').onclick = function () { stepZoom(-1); };
      $('pdf-zoom-in').onclick = function () { stepZoom(1); };
      $('pdf-zoom-reset').onclick = function () { if (pdfView && pdfView.scale !== 1) zoomTo(1); };

      async function openPdf(docItem) {
        if (docItem.error === 'password') { openUnlock(docItem); return; }
        var run = ++pdfRun;
        pdfView = null;
        var box = $('pdf-pages');
        box.textContent = '';
        var status = document.createElement('p');
        status.className = 'st-help';
        status.textContent = labels.loadingPdf;
        box.appendChild(status);
        $('pdf-title').textContent = docItem.name || docItem.subject || labels.pdf;
        $('pdf-tab').href = '/api/documents/pdf?' + pdfParams(docItem);
        $('pdf-download').href = '/api/documents/pdf?' + pdfParams(docItem);
        $('pdf-download').setAttribute('download', docItem.name || 'document.pdf');
        setZoomControls(false);
        $('pdf-dialog').showModal();
        try {
          var response = await fetch('/api/documents/pdf?' + pdfParams(docItem), { credentials: 'same-origin' });
          if (run !== pdfRun) return;
          if (response.status === 409) { closePdf(); openUnlock(docItem); return; }
          if (!response.ok) throw new Error(labels.pdfFailed);
          var bytes = await response.arrayBuffer();
          if (run !== pdfRun) return;
          var pdfjs = await loadPdfjs();
          if (run !== pdfRun) return;
          var task = pdfjs.getDocument({
            data: new Uint8Array(bytes),
            isEvalSupported: false,
            standardFontDataUrl: '/assets/pdfjs/standard_fonts/',
            cMapUrl: '/assets/pdfjs/cmaps/',
            cMapPacked: true,
          });
          pdfTask = task;
          var pdf = await task.promise;
          if (run !== pdfRun) return;
          box.textContent = '';
          var style = window.getComputedStyle(box);
          var padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
          var width = Math.max(240, box.clientWidth - padding);
          var dpr = Math.min(window.devicePixelRatio || 1, 2);
          var pages = [];
          for (var n = 1; n <= pdf.numPages; n += 1) {
            var page = await pdf.getPage(n);
            if (run !== pdfRun) return;
            var canvas = document.createElement('canvas');
            canvas.className = 'doc-page';
            box.appendChild(canvas);
            pages.push({ page: page, canvas: canvas });
          }
          pdfView = { pdf: pdf, pages: pages, width: width, dpr: dpr, scale: 1, serial: 0 };
          var painted = await paintPdf();
          if (!painted) throw new Error('render');
        } catch (error) {
          if (run !== pdfRun) return;
          pdfView = null;
          showPageImages(docItem, box, run);
        }
      }

      /**
       * If PDF.js cannot run, the server can still render each page to a PNG.
       * It is slower, but it keeps the document readable instead of a message.
       */
      function showPageImages(docItem, box, run) {
        pdfView = null;
        setZoomControls(false);
        box.textContent = '';
        var total = Math.max(1, Math.min(Number(docItem.pages) || 1, 80));
        for (var page = 1; page <= total; page += 1) {
          var img = document.createElement('img');
          img.src = '/api/documents/page?' + pdfParams(docItem) + '&page=' + page;
          img.alt = (docItem.name || labels.pdf) + ' — ' + page + '/' + total;
          img.loading = page === 1 ? 'eager' : 'lazy';
          if (page === 1) {
            img.onerror = function () {
              if (run !== pdfRun) return;
              box.textContent = '';
              var note = document.createElement('p');
              note.className = 'st-help';
              note.textContent = labels.pdfFailed;
              box.appendChild(note);
            };
          }
          box.appendChild(img);
        }
      }

      function openEmailDoc(docItem) {
        var dialog = $('email-dialog');
        $('email-title').textContent = labels.emailTitle;
        $('email-meta').textContent = '';
        $('email-text').textContent = '';
        dialog.showModal();
        fetch('/api/documents/message?key=' + encodeURIComponent(docItem.dedupKey) + '&part=' + encodeURIComponent(docItem.partId), { credentials: 'same-origin' })
          .then(async function (response) {
            var data = await response.json().catch(function () { return {}; });
            if (!response.ok) throw new Error(data.error || labels.emailMissing);
            $('email-title').textContent = data.subject || labels.emailTitle;
            var from = data.from ? (data.from.name ? data.from.name + ' <' + data.from.address + '>' : data.from.address) : '';
            $('email-meta').textContent = [from, data.date, data.folder].filter(Boolean).join(' · ');
            $('email-text').textContent = data.text || labels.noText;
          })
          .catch(function (error) { $('email-text').textContent = error.message; });
      }
      $('email-close').onclick = function () { $('email-dialog').close(); };

      async function analyzeDoc(docItem) {
        var status = $('doc-status');
        status.className = 'st-result';
        status.textContent = labels.analyzing;
        try {
          var response = await fetch('/api/documents/analyze', {
            method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin',
            body: JSON.stringify({ key: docItem.dedupKey, part: docItem.partId }),
          });
          var data = await response.json().catch(function () { return {}; });
          if (!response.ok) throw new Error(data.error || 'failed');
          if (!data.analyzed) { status.textContent = labels.aiNone; status.className = 'st-result'; }
          else { status.textContent = ''; }
          await load();
        } catch (error) {
          status.className = 'st-result bad';
          status.textContent = error.message;
        }
      }

      async function dismissDoc(docItem) {
        try {
          var response = await fetch('/api/documents/dismiss', {
            method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin',
            body: JSON.stringify({ key: docItem.dedupKey, part: docItem.partId, dismissed: !docItem.dismissed }),
          });
          var data = await response.json().catch(function () { return {}; });
          if (!response.ok) throw new Error(data.error || 'failed');
          await load();
        } catch (error) {
          alert(error.message);
        }
      }

      function openUnlock(docItem) {
        unlockTarget = docItem;
        var result = $('unlock-result');
        result.textContent = '';
        result.className = 'st-result';
        $('unlock-password').value = '';
        $('unlock-remember').checked = true;
        $('unlock-sender').textContent = docItem.sender
          ? labels.rememberFor.replace('{sender}', docItem.senderName || docItem.sender)
          : '';
        $('unlock-dialog').showModal();
        setTimeout(function () { $('unlock-password').focus(); }, 30);
      }
      $('unlock-cancel').onclick = function () { $('unlock-dialog').close(); };
      $('unlock-submit').onclick = async function () {
        if (!unlockTarget) return;
        var password = $('unlock-password').value;
        var result = $('unlock-result');
        if (!password) { result.className = 'st-result bad'; result.textContent = labels.wrong; return; }
        $('unlock-submit').disabled = true;
        result.className = 'st-result';
        result.textContent = labels.unlocking;
        try {
          var response = await fetch('/api/documents/unlock', {
            method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin',
            body: JSON.stringify({
              key: unlockTarget.dedupKey, part: unlockTarget.partId,
              password: password, remember: $('unlock-remember').checked,
            }),
          });
          var data = await response.json().catch(function () { return {}; });
          if (!response.ok) {
            throw new Error(data.code === 'wrong_password' ? labels.wrong : (data.error || 'failed'));
          }
          var opened = { ...unlockTarget, error: null, pages: data.pages || unlockTarget.pages };
          $('unlock-dialog').close();
          await load();
          await openPdf(opened);
        } catch (error) {
          result.className = 'st-result bad';
          result.textContent = error.message;
        } finally {
          $('unlock-submit').disabled = false;
        }
      };

      function actionLink(label, onClick) {
        var link = document.createElement('button');
        link.type = 'button';
        link.className = 'st-link';
        link.textContent = label;
        link.onclick = function (event) { event.stopPropagation(); onClick(); };
        return link;
      }

      function render(documents) {
        var body = $('doc-table').querySelector('tbody');
        body.textContent = '';
        if (!documents.length) {
          var empty = document.createElement('tr');
          var td = cell(labels.none);
          td.colSpan = 8;
          empty.appendChild(td);
          body.appendChild(empty);
          return;
        }
        documents.forEach(function (docItem) {
          var tr = document.createElement('tr');
          var nameCell = document.createElement('td');
          nameCell.className = 'doc-file';
          nameCell.textContent = (docItem.bill ? '🧾 ' : '') + (docItem.name || '');
          if (docItem.error === 'password') {
            var locked = document.createElement('span');
            locked.className = 'st-pill off';
            locked.textContent = labels.locked;
            nameCell.appendChild(document.createTextNode(' '));
            nameCell.appendChild(locked);
          }
          if (docItem.dismissed) {
            var gone = document.createElement('span');
            gone.className = 'st-pill';
            gone.textContent = labels.dismissed;
            nameCell.appendChild(document.createTextNode(' '));
            nameCell.appendChild(gone);
          }
          tr.appendChild(nameCell);
          tr.appendChild(cell(docItem.subject || '', '', labels.subject));
          tr.appendChild(cell(docItem.senderName || docItem.sender || '', '', labels.sender));
          tr.appendChild(cell((docItem.mailDate || '').slice(0, 10), '', labels.date));
          tr.appendChild(cell(docItem.pages || '', 'num', labels.pages));
          tr.appendChild(cell(docItem.amount || '', 'num', labels.amount));
          tr.appendChild(cell(docItem.dueDate || '', 'num', labels.due));
          var actions = document.createElement('td');
          actions.className = 'st-table-actions';
          actions.appendChild(actionLink(
            docItem.error === 'password' ? labels.unlock : labels.pdf,
            function () { openPdf(docItem); },
          ));
          actions.appendChild(actionLink(labels.text, function () {
            show({ name: docItem.name, subject: docItem.subject, text: docItem.error === 'password' ? labels.locked + ' — ' + labels.noText : docItem.text });
          }));
          actions.appendChild(actionLink(labels.email, function () { openEmailDoc(docItem); }));
          actions.appendChild(actionLink(labels.ai, function () { analyzeDoc(docItem); }));
          actions.appendChild(actionLink(docItem.dismissed ? labels.restore : labels.dismiss, function () { dismissDoc(docItem); }));
          tr.appendChild(actions);
          body.appendChild(tr);
        });
      }
      async function load() {
        var q = $('doc-q').value.trim();
        var bills = $('doc-bills').checked ? '1' : '0';
        var dismissed = $('doc-dismissed').checked ? '1' : '0';
        var response = await fetch('/api/documents?q=' + encodeURIComponent(q) + '&bills=' + bills + '&dismissed=' + dismissed, { credentials: 'same-origin' });
        var data = await response.json().catch(function () { return {}; });
        if (response.ok) render(data.documents || []);
      }
      async function indexAll(retry) {
        var button = $('doc-index');
        var retryButton = $('doc-retry');
        var status = $('doc-status');
        button.disabled = true;
        retryButton.disabled = true;
        status.className = 'st-result';
        var total = 0;
        for (var round = 0; round < 60; round += 1) {
          status.textContent = labels.indexing;
          var response = await fetch('/api/documents/index', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ retry: retry === true }) });
          var data = await response.json().catch(function () { return {}; });
          if (!response.ok) { status.textContent = data.error || 'failed'; status.className = 'st-result bad'; break; }
          total += data.indexed || 0;
          status.textContent = labels.indexed.replace('{n}', String(total)) + ' · ' + labels.left.replace('{n}', String(data.remaining || 0));
          if (!data.remaining || (!data.indexed && !data.failed)) break;
        }
        status.className = 'st-result ok';
        button.disabled = false;
        retryButton.disabled = false;
        await load();
      }
      $('doc-index').onclick = function () { indexAll(false); };
      $('doc-retry').onclick = function () { indexAll(true); };
      $('doc-search').onsubmit = function (event) { event.preventDefault(); load(); };
      $('doc-bills').onchange = load;
      $('doc-dismissed').onchange = load;
      $('doc-q').addEventListener('input', function () { clearTimeout(window.__docTimer); window.__docTimer = setTimeout(load, 250); });

      function addPdfs(item) {
        return fetch('/api/documents/from-live', {
          method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({
            handle: item.handle, subject: item.subject,
            from: item.from && item.from.address, date: item.date,
          }),
        }).then(async function (response) {
          var data = await response.json().catch(function () { return {}; });
          if (!response.ok) throw new Error(data.error || 'failed');
          $('add-result').className = 'st-result ok';
          $('add-result').textContent = labels.addDone.replace('{n}', String(data.indexed || 0));
          await load();
        });
      }
      $('add-search').onclick = async function () {
        var result = $('add-result');
        var hits = $('add-hits');
        result.className = 'st-result';
        result.textContent = '…';
        hits.textContent = '';
        try {
          var response = await fetch('/api/sync/search', {
            method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin',
            body: JSON.stringify({ mailbox: $('add-mailbox').value, query: $('add-query').value.trim() }),
          });
          var data = await response.json().catch(function () { return {}; });
          if (!response.ok) throw new Error(data.error || 'failed');
          if (!data.items.length) { result.textContent = labels.none; return; }
          result.textContent = '';
          var list = document.createElement('div');
          data.items.forEach(function (item) {
            var box = document.createElement('div');
            box.className = 'doc-add-item';
            var meta = document.createElement('div');
            meta.className = 'doc-add-meta';
            meta.textContent = [
              (item.date || '').slice(0, 10),
              item.from && (item.from.name || item.from.address),
              item.folder,
            ].filter(Boolean).join(' · ');
            var subject = document.createElement('div');
            subject.className = 'doc-add-subject';
            subject.textContent = item.subject || '';
            var add = document.createElement('button');
            add.type = 'button'; add.className = 'st-link'; add.textContent = labels.addPdfs;
            add.onclick = function () { add.disabled = true; addPdfs(item).catch(function (error) { add.disabled = false; result.className = 'st-result bad'; result.textContent = error.message; }); };
            box.appendChild(meta); box.appendChild(subject); box.appendChild(add);
            list.appendChild(box);
          });
          hits.appendChild(list);
        } catch (error) {
          result.className = 'st-result bad';
          result.textContent = error.message;
        }
      };
      load();
    })();</script>`, nonce);
}

const SETTINGS_SCRIPT = String.raw`
(function () {
'use strict';
var BOOT = JSON.parse(document.getElementById('boot').textContent);
var app = document.getElementById('app');
var lang = BOOT.lang;
var S = null;
var state = BOOT.state;
var bootId = BOOT.boot;
var forms = {};
// Opened from the mail view's gear: going back returns to it as it was left.
var cameFromMail = new URLSearchParams(location.search).has('back');

/** Use one language's words; both are in the page, so switching needs no reload. */
function applyLocale(next) {
  lang = next;
  var loc = BOOT.locales[lang];
  S = loc.strings;
  BOOT.fields = loc.fields;
  BOOT.sections = loc.sections;
  BOOT.providers = loc.providers;
  BOOT.oauthTitle = loc.oauthTitle;
  BOOT.nextLang = lang === 'zh-CN' ? 'en' : 'zh-CN';
}
applyLocale(lang);

function t(key, vars) {
  var text = S[key] || key;
  if (vars) Object.keys(vars).forEach(function (name) { text = text.split('{' + name + '}').join(String(vars[name])); });
  return text;
}
function el(tag, attrs) {
  var node = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function (key) {
    var value = attrs[key];
    if (value === undefined || value === null || value === false) return;
    if (key === 'text') node.textContent = value;
    else if (key === 'class') node.className = value;
    else if (key.slice(0, 2) === 'on') node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  });
  for (var i = 2; i < arguments.length; i++) {
    var child = arguments[i];
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    else node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}
function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

async function api(path, body) {
  var response;
  try {
    response = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch (e) {
    var offline = new Error(t('banner.offline'));
    throw offline;
  }
  var data = {};
  try { data = await response.json(); } catch (e) { data = {}; }
  if (response.status === 401 && data.code === 'admin_required') {
    location.href = '/signin?next=' + encodeURIComponent(location.pathname + location.search);
    throw new Error(data.error || 'signed out');
  }
  if (!response.ok) {
    var error = new Error(data.error || t('common.error'));
    error.data = data;
    throw error;
  }
  return data;
}

var toastTimer;
function toast(message, bad) {
  var node = document.getElementById('toast');
  node.textContent = message;
  node.className = 'toast' + (bad ? ' failed' : '');
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { node.hidden = true; }, bad ? 7000 : 3500);
}

function banner(message, kind) {
  var node = document.getElementById('banner');
  if (!message) { node.hidden = true; return; }
  node.textContent = message;
  node.className = 'st-banner' + (kind ? ' ' + kind : '');
  node.hidden = false;
}

async function health() {
  try {
    var response = await fetch('/healthz', { cache: 'no-store' });
    return await response.json();
  } catch (e) {
    return null;
  }
}

var waiting = false;
var afterRestart = [];
/** Run now, or once the restart under way has finished: a test would only hit the old process. */
function whenSettled(task) {
  if (waiting || (state && state.restart && state.restart.pending)) afterRestart.push(task);
  else task();
}
async function waitForRestart(after, message) {
  if (waiting) return;
  waiting = true;
  if (!bootId) { var first = await health(); bootId = first && first.boot; }
  banner(message || t('banner.restarting'));
  var started = Date.now();
  await sleep(1200);
  for (;;) {
    var report = await health();
    if (report && report.boot && report.boot !== bootId) {
      bootId = report.boot;
      waiting = false;
      if (after) { after(); return; }
      banner(t('banner.applied'), 'ok');
      setTimeout(function () { banner(''); updateIdleBanner(); }, 3000);
      await load();
      afterRestart.splice(0).forEach(function (task) { task(); });
      return;
    }
    if (Date.now() - started > 120000) { banner(t('banner.slow'), 'warn'); waiting = false; return; }
    await sleep(1000);
  }
}

function applied(outcome) {
  if (outcome === 'scheduled') waitForRestart();
  else if (outcome === 'manual') banner(t('banner.manual'), 'warn');
}

function updateIdleBanner() {
  if (!state || waiting) return;
  if (state.restart && state.restart.manual) banner(t('banner.manual'), 'warn');
  else if (state.restart && state.restart.pending) waitForRestart();
  else if (BOOT.mode === 'settings' && state.mode === 'idle') banner(t('banner.idle'), 'warn');
  else banner('');
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

function fieldsOf(section, advanced) {
  return BOOT.fields.filter(function (f) { return f.section === section && (advanced === undefined || f.advanced === advanced); });
}
function storedValue(key) { return state.values[key] !== undefined ? state.values[key] : ''; }

/** One form over a set of fields: tracks what changed, saves only that. */
function makeForm(id, fields, options) {
  options = options || {};
  var form = { id: id, fields: fields, controls: {}, clear: {}, node: null, result: null, saveButton: null };
  var root = el('div', { class: 'st-form' });
  var basic = fields.filter(function (f) { return !f.advanced; });
  var more = fields.filter(function (f) { return f.advanced; });
  basic.forEach(function (f) { root.appendChild(renderField(form, f)); });
  if (more.length) {
    var inner = el('div', { class: 'st-form' });
    more.forEach(function (f) { inner.appendChild(renderField(form, f)); });
    root.appendChild(el('details', { class: 'st-more' }, el('summary', { text: t('common.more') }), inner));
  }
  form.result = el('span', { class: 'st-result', 'aria-live': 'polite' });
  form.saveButton = el('button', { type: 'button', class: 'st-btn primary', disabled: true, text: options.saveLabel || t('common.save'), onclick: function () { save(form, options); } });
  var foot = el('div', { class: 'st-foot' }, form.result);
  if (options.test) foot.appendChild(el('button', { type: 'button', class: 'st-btn', text: options.testLabel || t('common.test'), onclick: function (event) { runTest(form, options.test, event.target); } }));
  if (!options.noSave) foot.appendChild(form.saveButton);
  root.appendChild(foot);
  form.node = root;
  if (form.controls.LLM_PROVIDER && form.controls.LLM_BASE_URL) {
    // The endpoint matters for a custom provider; for a preset it is an override few need.
    var endpoint = root.querySelector('[data-key="LLM_BASE_URL"]');
    var showEndpoint = function () {
      endpoint.hidden = form.controls.LLM_PROVIDER.read() !== 'custom' && !form.controls.LLM_BASE_URL.read();
    };
    form.controls.LLM_PROVIDER.input.addEventListener('change', showEndpoint);
    showEndpoint();
  }
  form.onChange = function () {
    form.saveButton.disabled = Object.keys(changes(form)).length === 0;
    if (options.onChange) options.onChange(form);
  };
  forms[id] = form;
  return form;
}

function renderField(form, f) {
  var id = 'f-' + form.id + '-' + f.key;
  var wrap = el('div', { class: 'st-field', 'data-key': f.key, 'data-personal': f.personal ? '1' : '0', 'data-overridable': f.overridable ? '1' : '0' });
  var control;
  var stored = storedValue(f.key);
  var help = f.help;
  if (f.type === 'boolean') {
    control = el('input', { type: 'checkbox', role: 'switch', id: id });
    control.checked = (stored || f.defaultValue || 'false') === 'true';
    control.addEventListener('change', function () { form.onChange(); });
    var text = el('span', { class: 'st-toggle-text' }, el('span', { class: 'st-label', text: f.label }), help ? el('p', { class: 'st-help', text: help }) : null);
    wrap.appendChild(el('label', { class: 'st-toggle', for: id }, text, control));
    form.controls[f.key] = { field: f, input: control, read: function () { return control.checked ? 'true' : 'false'; }, initial: control.checked ? 'true' : 'false', stored: stored };
    wrap.appendChild(el('p', { class: 'st-error', hidden: true }));
    return wrap;
  }
  wrap.appendChild(el('label', { for: id, text: f.label }));
  if (f.type === 'select') {
    control = el('select', { id: id });
    (f.options || []).forEach(function (o) { control.appendChild(el('option', { value: o.value, text: o.label })); });
    control.value = stored || f.defaultValue || '';
    if (control.value !== (stored || f.defaultValue || '')) control.value = '';
  } else if (f.type === 'textarea' || (f.type === 'list' && f.section === 'triage')) {
    control = el('textarea', { id: id, rows: f.type === 'textarea' ? 4 : 2, placeholder: f.placeholder || f.defaultValue || '' });
    control.value = f.type === 'list' ? stored.split(',').filter(Boolean).join(', ') : stored;
  } else if (f.type === 'secret') {
    var isSet = Boolean(state.secrets[f.key]);
    control = el('input', { type: 'password', id: id, autocomplete: 'new-password', spellcheck: 'false', placeholder: isSet ? t('secret.keep') : (f.placeholder || '') });
    var pill = el('span', { class: 'st-pill' + (isSet ? ' set' : ''), text: isSet ? t('common.set') : t('common.notSet') });
    var row = el('div', { class: 'st-secret' }, control, pill);
    if (isSet) {
      var clear = el('button', { type: 'button', class: 'st-link danger', text: t('common.remove') });
      clear.onclick = function () {
        form.clear[f.key] = !form.clear[f.key];
        clear.textContent = form.clear[f.key] ? t('common.undo') : t('common.remove');
        pill.textContent = form.clear[f.key] ? t('common.removed') : t('common.set');
        pill.className = 'st-pill' + (form.clear[f.key] ? ' warn' : ' set');
        control.disabled = Boolean(form.clear[f.key]);
        form.onChange();
      };
      row.appendChild(clear);
    }
    wrap.appendChild(row);
  } else {
    var type = f.type === 'number' ? 'text' : (f.type === 'url' ? 'url' : 'text');
    control = el('input', { type: type, id: id, inputmode: f.type === 'number' ? 'numeric' : null, spellcheck: 'false', autocomplete: 'off',
      placeholder: f.placeholder || (f.key === 'TZ' ? state.timeZone : f.defaultValue) || '' });
    control.value = f.type === 'list' ? stored.split(',').filter(Boolean).join(', ') : stored;
  }
  if (f.type !== 'secret') wrap.appendChild(control);
  control.addEventListener('input', function () { form.onChange(); });
  control.addEventListener('change', function () { form.onChange(); });
  var hint = help;
  if (f.type === 'number' && f.defaultValue && f.type !== 'select') hint = (help ? help + ' ' : '') + t('common.default', { v: f.defaultValue });
  if (hint) wrap.appendChild(el('p', { class: 'st-help', text: hint }));
  wrap.appendChild(el('p', { class: 'st-error', hidden: true }));
  form.controls[f.key] = {
    field: f, input: control, stored: stored,
    read: function () { return control.value; },
    initial: f.type === 'secret' ? '' : control.value,
  };
  return wrap;
}

/** What the form would change: a value per edited field, null for a secret to remove. */
function changes(form) {
  var out = {};
  Object.keys(form.controls).forEach(function (key) {
    var c = form.controls[key];
    if (c.field.type === 'secret') {
      if (form.clear[key]) out[key] = null;
      else if (c.read().trim()) out[key] = c.read();
      return;
    }
    var value = c.read();
    if (value !== c.initial) out[key] = value;
  });
  return out;
}

function showErrors(form, errors) {
  var first = null;
  Object.keys(form.controls).forEach(function (key) {
    var wrap = form.node.querySelector('[data-key="' + key + '"]');
    if (!wrap) return;
    var message = errors && errors[key];
    wrap.classList.toggle('bad', Boolean(message));
    var line = wrap.querySelector('.st-error');
    line.hidden = !message;
    line.textContent = message || '';
    if (message && !first) first = form.controls[key].input;
  });
  if (first) {
    var details = first.closest('details');
    if (details) details.open = true;
    first.focus();
  }
}

function setResult(form, message, kind) {
  form.result.textContent = message || '';
  form.result.className = 'st-result' + (kind ? ' ' + kind : '');
}

async function save(form, options) {
  var values = changes(form);
  if (!Object.keys(values).length) { if (options.after) options.after(); return; }
  form.saveButton.disabled = true;
  setResult(form, t('common.saving'));
  showErrors(form, null);
  try {
    var data = await api('/api/admin/settings', { values: values });
    state = data.state;
    setResult(form, t('common.saved'), 'ok');
    resetForm(form);
    applied(data.applied);
    if (options.after) options.after();
    else if (options.rerender) options.rerender();
  } catch (error) {
    setResult(form, error.message, 'bad');
    if (error.data && error.data.errors) showErrors(form, error.data.errors);
    form.saveButton.disabled = false;
  }
}

function resetForm(form) {
  Object.keys(form.controls).forEach(function (key) {
    var c = form.controls[key];
    if (c.field.type === 'secret') {
      c.input.value = '';
      var isSet = Boolean(state.secrets[key]);
      c.input.placeholder = isSet ? t('secret.keep') : (c.field.placeholder || '');
      c.input.disabled = false;
      var pill = c.input.parentNode.querySelector('.st-pill');
      if (pill) { pill.textContent = isSet ? t('common.set') : t('common.notSet'); pill.className = 'st-pill' + (isSet ? ' set' : ''); }
      var clear = c.input.parentNode.querySelector('.st-link');
      if (clear && !isSet) clear.remove();
      form.clear[key] = false;
    } else {
      c.initial = c.read();
    }
  });
  form.onChange();
}

async function runTest(form, path, button) {
  var label = button.textContent;
  button.disabled = true;
  button.textContent = t('common.testing');
  setResult(form, '');
  showErrors(form, null);
  try {
    var data = await api(path, { values: changes(form) });
    setResult(form, data.message, 'ok');
  } catch (error) {
    setResult(form, error.message, 'bad');
    if (error.data && error.data.errors) showErrors(form, error.data.errors);
  }
  button.disabled = false;
  button.textContent = label;
}

// ---------------------------------------------------------------------------
// Mailboxes
// ---------------------------------------------------------------------------

function provider(id) { return BOOT.providers.find(function (p) { return p.id === id; }) || { id: id, label: id, oauth: false, host: '', port: 993 }; }
function oauthName(id) { return id === 'gmail' ? 'Google' : 'Microsoft'; }
function folderSummary(m) {
  if (!m.folders || !m.folders.length) return t('mb.foldersDefault');
  if (m.folders.length === 1 && m.folders[0].toLowerCase() === 'all') return t('mb.foldersAll');
  return m.folders.join(', ');
}
var mailboxNotes = {};

function readinessView(m) {
  switch (m.readiness) {
    case 'ready': return { dot: 'ready', text: t('mb.ready'), pill: 'set' };
    case 'disabled': return { dot: 'off', text: t('mb.disabled'), pill: 'off' };
    case 'needs-authorization': return { dot: 'warn', text: t('mb.needsAuth'), pill: 'warn' };
    case 'needs-password': return { dot: 'warn', text: t('mb.needsPassword'), pill: 'warn' };
    default: return { dot: 'warn', text: t('mb.invalid'), pill: 'warn' };
  }
}

function renderMailboxes(container) {
  container.textContent = '';
  var list = el('ul', { class: 'st-mailboxes' });
  if (!state.mailboxes.length) container.appendChild(el('p', { class: 'st-empty', text: t('mb.none') }));
  state.mailboxes.forEach(function (m) {
    var view = readinessView(m);
    var note = mailboxNotes[m.id];
    var actions = el('div', { class: 'st-mb-actions' });
    actions.appendChild(el('span', { class: 'st-pill ' + view.pill, text: view.text }));
    if (m.oauth) {
      actions.appendChild(el('button', { type: 'button', class: 'st-btn', text: m.readiness === 'needs-authorization' ? t('mb.signin') : t('mb.signinAgain'), onclick: function () { signIn(m.id); } }));
    }
    if (m.readiness === 'ready') actions.appendChild(el('button', { type: 'button', class: 'st-btn', text: t('mb.test'), onclick: function (e) { testSaved(m, e.target); } }));
    actions.appendChild(el('button', { type: 'button', class: 'st-btn', text: t('mb.edit'), onclick: function () { openMailbox(m); } }));
    list.appendChild(el('li', { class: 'st-mb' },
      el('span', { class: 'st-dot ' + view.dot, 'aria-hidden': 'true' }),
      el('div', null,
        el('div', { class: 'st-mb-name', text: m.name || m.username }),
        el('div', { class: 'st-mb-meta', text: (m.name ? m.username + ' · ' : '') + provider(m.provider).label + ' · ' + folderSummary(m) }),
        m.canSend === false ? el('div', { class: 'st-mb-note bad', text: t('mb.readOnly') }) : null,
        note ? el('div', { class: 'st-mb-note ' + (note.ok ? 'ok' : 'bad'), text: note.text }) : null),
      actions));
  });
  if (state.mailboxes.length) container.appendChild(list);
  container.appendChild(el('button', { type: 'button', class: 'st-btn', text: '+ ' + t('mb.add'), onclick: function () { openMailbox(null); } }));
}

async function testSaved(m, button) {
  if (button) { button.disabled = true; button.textContent = t('common.testing'); }
  try {
    var data = await api('/api/admin/mailboxes/test', { id: m.id });
    mailboxNotes[m.id] = { ok: true, text: t('mb.testOk', { n: data.folders.length }) };
  } catch (error) {
    mailboxNotes[m.id] = { ok: false, text: error.message };
  }
  refreshMailboxes();
}

function refreshMailboxes() {
  document.querySelectorAll('[data-mailboxes]').forEach(function (node) { renderMailboxes(node); });
  if (BOOT.mode === 'setup') updateSetupNav();
}

async function signIn(id) {
  try {
    var data = await api('/api/admin/oauth/start', { id: id });
    if (data.mode === 'direct') { location.href = data.url; return; }
    window.open(data.url, '_blank', 'noopener');
    openPaste(id, data);
  } catch (error) {
    toast(error.message, true);
  }
}

function openPaste(id, start) {
  var m = state.mailboxes.find(function (x) { return x.id === id; });
  var dialog = document.getElementById('dialog');
  var input = el('input', { type: 'url', class: 'st-input', placeholder: t('oauth.pastePlaceholder'), spellcheck: 'false', autocomplete: 'off' });
  var result = el('span', { class: 'st-result', 'aria-live': 'polite' });
  var finish = el('button', { type: 'submit', class: 'st-btn primary', text: t('oauth.finish') });
  var form = el('form', { method: 'dialog' },
    el('div', { class: 'st-dialog-head' }, el('h2', { text: t('oauth.pasteTitle') })),
    el('div', { class: 'st-dialog-body' },
      el('p', { class: 'st-help', text: t('oauth.pasteBody', { p: oauthName(m ? m.provider : 'gmail') }) }),
      el('div', { class: 'st-field' }, input),
      el('div', null, el('a', { href: start.url, target: '_blank', rel: 'noopener', class: 'st-link', text: t('oauth.reopen') }))),
    el('div', { class: 'st-dialog-foot' }, result, el('span', { class: 'st-spacer' }),
      el('button', { type: 'button', class: 'st-btn', text: t('common.cancel'), onclick: function () { dialog.close(); } }), finish));
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    finish.disabled = true;
    result.textContent = '';
    try {
      var data = await api('/api/admin/oauth/finish', { url: input.value, state: start.state });
      state = data.state;
      dialog.close();
      toast(t('oauth.ok'));
      applied(data.applied);
      refreshMailboxes();
      var saved = state.mailboxes.find(function (x) { return x.id === id; });
      if (saved && saved.readiness === 'ready') whenSettled(function () { testSaved(saved); });
    } catch (error) {
      result.textContent = error.message;
      result.className = 'st-result bad';
      finish.disabled = false;
    }
  });
  dialog.textContent = '';
  dialog.appendChild(form);
  dialog.showModal();
  input.focus();
}

function field(label, control, help, id) {
  return el('div', { class: 'st-field' }, el('label', { for: id, text: label }), control, help ? el('p', { class: 'st-help', text: help }) : null);
}

function openMailbox(m) {
  var editing = Boolean(m);
  m = m || { provider: BOOT.providers[0].id, username: '', name: '', host: '', port: null, ssl: true, folders: [], smtpHost: '', smtpPort: null, fromName: '', authservId: '', enabled: true, oauth: false, hasPassword: false, readiness: 'needs-password' };
  var dialog = document.getElementById('dialog');
  var discovered = null;
  var selected = (m.folders || []).slice();

  var providerSelect = el('select', { id: 'mb-provider' });
  BOOT.providers.forEach(function (p) { providerSelect.appendChild(el('option', { value: p.id, text: p.label })); });
  providerSelect.value = m.provider;
  var address = el('input', { type: 'email', id: 'mb-address', autocomplete: 'off', spellcheck: 'false', required: true, placeholder: 'you@example.com' });
  address.value = m.username;
  var password = el('input', { type: 'password', id: 'mb-password', autocomplete: 'new-password', placeholder: m.hasPassword ? t('mb.passwordKeep') : '' });
  var name = el('input', { type: 'text', id: 'mb-name', placeholder: t('mb.namePlaceholder') });
  name.value = m.name || '';
  var passwordField = field(t('mb.password'), password, t('mb.passwordHelp'), 'mb-password');
  var oauthBox = el('div', { class: 'st-form' });

  var foldersMode = !m.folders.length ? 'default' : (m.folders.length === 1 && m.folders[0].toLowerCase() === 'all' ? 'all' : 'custom');
  var radios = el('div', { class: 'st-radio', role: 'radiogroup' });
  var folderList = el('div', { class: 'st-folders', hidden: true });
  var folderHint = el('p', { class: 'st-help', text: t('mb.foldersHint') });
  [['default', t('mb.foldersDefault')], ['all', t('mb.foldersAll')], ['custom', t('mb.foldersCustom')]].forEach(function (pair) {
    var radio = el('input', { type: 'radio', name: 'mb-folders', value: pair[0] });
    radio.checked = foldersMode === pair[0];
    radio.addEventListener('change', function () { foldersMode = pair[0]; drawFolders(); });
    radios.appendChild(el('label', null, radio, pair[1]));
  });
  function drawFolders() {
    folderList.textContent = '';
    folderList.hidden = foldersMode !== 'custom';
    folderHint.hidden = foldersMode !== 'custom' || Boolean(discovered);
    if (foldersMode !== 'custom') return;
    var items = discovered ? discovered.slice() : [];
    selected.forEach(function (path) { if (!items.some(function (f) { return f.path === path; })) items.push({ path: path, specialUse: null }); });
    if (!selected.length && discovered) {
      discovered.forEach(function (f) { if (f.path.toUpperCase() === 'INBOX' || f.specialUse === '\\Junk') selected.push(f.path); });
    }
    if (!items.length) { folderList.hidden = true; return; }
    items.forEach(function (f) {
      var box = el('input', { type: 'checkbox', value: f.path });
      box.checked = selected.indexOf(f.path) >= 0;
      box.addEventListener('change', function () {
        if (box.checked) { if (selected.indexOf(f.path) < 0) selected.push(f.path); }
        else selected = selected.filter(function (p) { return p !== f.path; });
      });
      folderList.appendChild(el('label', null, box, f.path, f.specialUse ? el('small', { text: f.specialUse.replace('\\', '') }) : null));
    });
  }

  var host = el('input', { type: 'text', id: 'mb-host', spellcheck: 'false', autocomplete: 'off' });
  host.value = m.host || '';
  var port = el('input', { type: 'text', id: 'mb-port', inputmode: 'numeric' });
  port.value = m.port || '';
  var ssl = el('input', { type: 'checkbox', role: 'switch', id: 'mb-ssl' });
  ssl.checked = m.ssl !== false;
  var smtpHost = el('input', { type: 'text', id: 'mb-smtp-host', spellcheck: 'false', autocomplete: 'off', placeholder: t('mb.providerDefault') });
  smtpHost.value = m.smtpHost || '';
  var smtpPort = el('input', { type: 'text', id: 'mb-smtp-port', inputmode: 'numeric', placeholder: t('mb.providerDefault') });
  smtpPort.value = m.smtpPort || '';
  var fromName = el('input', { type: 'text', id: 'mb-from' });
  fromName.value = m.fromName || '';
  var authserv = el('input', { type: 'text', id: 'mb-authserv', spellcheck: 'false', autocomplete: 'off' });
  authserv.value = m.authservId || '';
  var enabled = el('input', { type: 'checkbox', role: 'switch', id: 'mb-enabled' });
  enabled.checked = m.enabled !== false;
  var server = el('details', { class: 'st-more' }, el('summary', { text: t('mb.server') }), el('div', { class: 'st-form' },
    el('div', { class: 'st-row2' }, field(t('mb.host'), host, null, 'mb-host'), field(t('mb.port'), port, null, 'mb-port')),
    el('label', { class: 'st-toggle', for: 'mb-ssl' }, el('span', { class: 'st-label', text: t('mb.ssl') }), ssl),
    el('div', { class: 'st-row2' }, field(t('mb.smtpHost'), smtpHost, t('mb.smtpHostHelp'), 'mb-smtp-host'), field(t('mb.smtpPort'), smtpPort, null, 'mb-smtp-port')),
    field(t('mb.fromName'), fromName, null, 'mb-from'),
    field(t('mb.authserv'), authserv, t('mb.authservHelp'), 'mb-authserv')));

  var testResult = el('span', { class: 'st-result', 'aria-live': 'polite' });
  var testButton = el('button', { type: 'button', class: 'st-btn', text: t('mb.testConn') });
  var error = el('p', { class: 'st-error', hidden: true });
  var saveButton = el('button', { type: 'submit', class: 'st-btn primary', text: t('common.save') });
  var oauthForm = null;

  function current() {
    var p = provider(providerSelect.value);
    return {
      provider: p.id, username: address.value.trim(), password: p.oauth ? '' : password.value, name: name.value.trim(),
      host: host.value.trim(), port: port.value.trim() || null, ssl: ssl.checked,
      folders: foldersMode === 'default' ? [] : (foldersMode === 'all' ? ['all'] : selected.slice()),
      smtpHost: smtpHost.value.trim(), smtpPort: smtpPort.value.trim() || null, fromName: fromName.value.trim(),
      authservId: authserv.value.trim(), enabled: enabled.checked,
    };
  }
  function authorizedNow() { return editing && m.provider === providerSelect.value && m.username === address.value.trim().toLowerCase() && m.readiness !== 'needs-authorization'; }
  function drawProvider() {
    var p = provider(providerSelect.value);
    passwordField.hidden = p.oauth;
    host.placeholder = p.host || 'imap.example.com';
    port.placeholder = String(p.port);
    if (p.id === 'imap' && !server.open) server.open = true;
    oauthBox.textContent = '';
    oauthForm = null;
    oauthBox.hidden = !p.oauth;
    if (p.oauth) {
      var configured = state.oauthApps[p.id === 'gmail' ? 'gmail' : 'outlook'];
      oauthBox.appendChild(el('p', { class: 'st-note', text: t('mb.oauthNote', { p: oauthName(p.id) }) }));
      if (!configured) {
        oauthBox.appendChild(el('p', { class: 'st-help', text: t('mb.oauthApp', { p: oauthName(p.id) }) }));
        var keys = p.id === 'gmail' ? ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET'] : ['OUTLOOK_CLIENT_ID', 'OUTLOOK_CLIENT_SECRET', 'OUTLOOK_TENANT'];
        var fs = BOOT.fields.filter(function (f) { return keys.indexOf(f.key) >= 0; }).map(function (f) { return Object.assign({}, f, { advanced: f.key === 'OUTLOOK_TENANT' || f.key === 'OUTLOOK_CLIENT_SECRET' }); });
        oauthForm = makeForm('mb-oauth', fs, { noSave: true });
        oauthBox.appendChild(oauthForm.node);
      }
    }
    var needsSignIn = p.oauth && !authorizedNow();
    saveButton.textContent = needsSignIn ? t('mb.saveSignin') : t('common.save');
    testButton.disabled = p.oauth && !authorizedNow();
    testResult.textContent = testButton.disabled ? t('mb.testFirst') : '';
    testResult.className = 'st-result';
  }
  providerSelect.addEventListener('change', drawProvider);
  address.addEventListener('input', drawProvider);

  testButton.onclick = async function () {
    testButton.disabled = true;
    testResult.textContent = t('common.testing');
    testResult.className = 'st-result';
    try {
      var data = await api('/api/admin/mailboxes/test', { id: editing ? m.id : undefined, mailbox: current() });
      discovered = data.folders;
      testResult.textContent = t('mb.testOk', { n: data.folders.length });
      testResult.className = 'st-result ok';
      drawFolders();
    } catch (e) {
      testResult.textContent = e.message;
      testResult.className = 'st-result bad';
    }
    testButton.disabled = false;
  };

  var form = el('form', { method: 'dialog', novalidate: true },
    el('div', { class: 'st-dialog-head' }, el('h2', { text: editing ? t('mb.dialogEdit') : t('mb.dialogNew') })),
    el('div', { class: 'st-dialog-body' },
      field(t('mb.provider'), providerSelect, null, 'mb-provider'),
      field(t('mb.address'), address, null, 'mb-address'),
      passwordField,
      oauthBox,
      field(t('mb.name'), name, null, 'mb-name'),
      el('div', { class: 'st-field' }, el('span', { class: 'st-label', text: t('mb.folders') }), radios, folderHint, folderList),
      el('div', { class: 'st-inline' }, testButton, testResult),
      server,
      editing ? el('label', { class: 'st-toggle', for: 'mb-enabled' }, el('span', { class: 'st-label', text: t('mb.enabled') }), enabled) : null,
      error),
    el('div', { class: 'st-dialog-foot' },
      editing ? el('button', { type: 'button', class: 'st-btn danger', text: t('common.delete'), onclick: remove }) : null,
      el('span', { class: 'st-spacer' }),
      el('button', { type: 'button', class: 'st-btn', text: t('common.cancel'), onclick: function () { dialog.close(); } }),
      saveButton));

  async function remove() {
    if (!confirm(t('mb.deleteConfirm', { a: m.username }))) return;
    try {
      var data = await api('/api/admin/mailboxes/delete', { id: m.id });
      state = data.state;
      dialog.close();
      toast(t('mb.deleted'));
      applied(data.applied);
      refreshMailboxes();
    } catch (e) {
      error.textContent = e.message;
      error.hidden = false;
    }
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    error.hidden = true;
    saveButton.disabled = true;
    try {
      var p = provider(providerSelect.value);
      var needsSignIn = p.oauth && !authorizedNow();
      if (oauthForm) {
        var appValues = changes(oauthForm);
        if (Object.keys(appValues).length) {
          var savedApp = await api('/api/admin/settings', { values: appValues });
          state = savedApp.state;
          applied(savedApp.applied);
        }
      }
      var data = await api('/api/admin/mailboxes/save', { id: editing ? m.id : undefined, mailbox: current() });
      state = data.state;
      if (!needsSignIn) applied(data.applied);
      dialog.close();
      refreshMailboxes();
      if (needsSignIn) { await signIn(data.mailbox.id); return; }
      toast(t('common.saved'));
      if (data.mailbox.readiness === 'ready' && !editing) {
        var fresh = data.mailbox;
        whenSettled(function () { testSaved(fresh); });
      }
    } catch (e) {
      error.textContent = e.message;
      error.hidden = false;
      if (e.data && e.data.errors && oauthForm) showErrors(oauthForm, e.data.errors);
    }
    saveButton.disabled = false;
  });

  dialog.textContent = '';
  dialog.appendChild(form);
  drawProvider();
  drawFolders();
  dialog.showModal();
  (editing ? name : address).focus();
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

function renderAccess(section) {
  var origin = location.origin;
  var endpoint = origin + '/mcp';
  var passwordBlock = el('div', { class: 'st-block' },
    el('h3', { text: t('access.password') }), el('p', { class: 'st-help', text: t('access.passwordBody') }));
  var changeArea = el('div', { class: 'st-form', hidden: true });
  var current = el('input', { type: 'password', id: 'pw-current', autocomplete: 'current-password' });
  var next = el('input', { type: 'password', id: 'pw-next', autocomplete: 'new-password', minlength: String(BOOT.minPassword) });
  var result = el('span', { class: 'st-result', 'aria-live': 'polite' });
  changeArea.appendChild(field(t('access.current'), current, null, 'pw-current'));
  changeArea.appendChild(field(t('access.new'), next, t('claim.short', { n: BOOT.minPassword }), 'pw-next'));
  changeArea.appendChild(el('div', { class: 'st-foot' }, result, el('button', { type: 'button', class: 'st-btn primary', text: t('common.save'), onclick: async function (e) {
    e.target.disabled = true;
    try {
      await api('/api/admin/password', { current: current.value, next: next.value });
      current.value = ''; next.value = '';
      changeArea.hidden = true;
      toast(t('access.changed'));
    } catch (error) { result.textContent = error.message; result.className = 'st-result bad'; }
    e.target.disabled = false;
  } })));
  passwordBlock.appendChild(el('div', { class: 'st-inline' },
    el('button', { type: 'button', class: 'st-btn', text: t('access.change'), onclick: function () { changeArea.hidden = !changeArea.hidden; if (!changeArea.hidden) current.focus(); } }),
    el('button', { type: 'button', class: 'st-btn', text: t('access.endOthers'), onclick: async function () {
      try { var data = await api('/api/admin/sessions/end-others', {}); toast(t('access.ended', { n: data.ended })); } catch (error) { toast(error.message, true); }
    } })));
  passwordBlock.appendChild(changeArea);
  passwordBlock.appendChild(el('p', { class: 'st-help', text: t('access.forgot') }));
  section.appendChild(passwordBlock);

  var totpOn = Boolean(state.user && state.user.totpEnabled);
  var totp = el('div', { class: 'st-block' }, el('h3', { text: t('access.totp') }),
    el('p', { class: 'st-help', text: t('access.totpBody') }));
  var totpStatus = el('span', { class: 'st-pill' + (totpOn ? ' set' : ''), text: totpOn ? t('access.totpOn') : t('access.totpOff') });
  totp.appendChild(el('div', { class: 'st-inline' }, totpStatus,
    el('button', { type: 'button', class: 'st-btn', text: totpOn ? t('access.totpDisable') : t('access.totpEnable'), onclick: function () {
      if (totpOn) {
        var dialog = document.getElementById('dialog');
        var password = el('input', { type: 'password', id: 'totp-pw', autocomplete: 'current-password' });
        var form = el('form', { method: 'dialog' },
          el('div', { class: 'st-dialog-head' }, el('h2', { text: t('access.totpDisable') })),
          el('div', { class: 'st-dialog-body' }, field(t('access.totpPassword'), password, null, 'totp-pw')),
          el('div', { class: 'st-dialog-foot' }, el('span', { class: 'st-spacer' }), el('button', { type: 'submit', class: 'st-btn danger', text: t('access.totpDisable'), onclick: async function (event) {
            event.preventDefault();
            try { await api('/api/admin/totp/disable', { password: password.value }); dialog.close(); toast(t('access.totpOffDone')); location.reload(); }
            catch (error) { toast(error.message, true); }
          } })));
        dialog.textContent = '';
        dialog.appendChild(form);
        dialog.showModal();
        password.focus();
        return;
      }
      (async function () {
        try {
          var data = await api('/api/admin/totp/setup', {});
          var code = el('input', { type: 'text', id: 'totp-code', inputmode: 'numeric', autocomplete: 'one-time-code' });
          var dialog = document.getElementById('dialog');
          var form = el('form', { method: 'dialog' },
            el('div', { class: 'st-dialog-head' }, el('h2', { text: t('access.totpEnable') })),
            el('div', { class: 'st-dialog-body' },
              el('p', { class: 'st-help', text: t('access.totpScan') }),
              el('div', { class: 'st-inline' }, el('code', { class: 'st-code', text: data.secret }), copyButton(data.secret)),
              el('p', { class: 'st-help', text: data.otpauth }),
              field(t('access.totpCode'), code, null, 'totp-code')),
            el('div', { class: 'st-dialog-foot' }, el('span', { class: 'st-spacer' }), el('button', { type: 'submit', class: 'st-btn primary', text: t('common.save'), onclick: async function (event) {
              event.preventDefault();
              try { await api('/api/admin/totp/enable', { code: code.value }); dialog.close(); toast(t('access.totpDone')); location.reload(); }
              catch (error) { toast(error.message, true); }
            } })));
          dialog.textContent = '';
          dialog.appendChild(form);
          dialog.showModal();
          code.focus();
        } catch (error) { toast(error.message, true); }
      })();
    } })));
  section.appendChild(totp);

  var mcp = el('div', { class: 'st-block st-owner-only' }, el('h3', { text: t('access.mcp') }), el('p', { class: 'st-help', text: t('access.mcpBody') }),
    el('div', { class: 'st-field' }, el('span', { class: 'st-label', text: t('access.endpoint') }),
      el('div', { class: 'st-inline' }, el('code', { class: 'st-code', text: endpoint }), copyButton(endpoint))));
  [['read', t('access.read'), t('access.readBody')], ['write', t('access.write'), t('access.writeBody')]].forEach(function (row) {
    mcp.appendChild(el('div', { class: 'st-token' },
      el('div', null, el('div', { class: 'st-label', text: row[1] }), el('p', { class: 'st-help', text: row[2] })),
      el('div', { class: 'st-inline' }, el('span', { class: 'st-pill' + (state.tokens[row[0]] ? ' set' : ''), text: state.tokens[row[0]] ? t('common.set') : t('common.notSet') }),
        el('button', { type: 'button', class: 'st-btn', text: t('access.generate'), onclick: function () { rotate(row[0], row[1]); } }))));
  });
  mcp.appendChild(el('p', { class: 'st-help', text: state.channel === 'https' ? t('access.https') : t('access.loopback') }));
  section.appendChild(mcp);

  // Per-person tokens: every user may issue and revoke their own, so a
  // household assistant can reach one mailbox without the owner's token.
  var personal = el('div', { class: 'st-block st-personal' }, el('h3', { text: t('access.personalTokens') }),
    el('p', { class: 'st-help', text: t('access.personalBody') }));
  var tokenList = el('div', { class: 'st-form' });
  personal.appendChild(tokenList);
  var actions = el('div', { class: 'st-inline' },
    el('button', { type: 'button', class: 'st-btn', text: t('access.createRead'), onclick: function () { issue(false); } }),
    el('button', { type: 'button', class: 'st-btn', text: t('access.createWrite'), onclick: function () { issue(true); } }));
  personal.appendChild(actions);
  section.appendChild(personal);

  async function loadTokens() {
    tokenList.textContent = '';
    try {
      var data = await api('/api/admin/mcp-tokens');
      if (!data.tokens.length) { tokenList.appendChild(el('p', { class: 'st-help', text: t('access.none') })); return; }
      data.tokens.forEach(function (token) {
        tokenList.appendChild(el('div', { class: 'st-token' },
          el('div', null, el('div', { class: 'st-label', text: (token.writable ? t('access.writable') : t('access.readOnly')) }),
            el('p', { class: 'st-help', text: new Date(token.createdAt).toLocaleString(lang) })),
          el('div', { class: 'st-inline' },
            el('button', { type: 'button', class: 'st-btn danger', text: t('access.revoke'), onclick: async function () {
              try { await api('/api/admin/mcp-tokens/revoke', { id: token.id }); loadTokens(); } catch (error) { toast(error.message, true); }
            } }))));
      });
    } catch (error) { tokenList.appendChild(el('p', { class: 'st-help', text: error.message })); }
  }
  async function issue(writable) {
    try {
      var data = await api('/api/admin/mcp-tokens/create', { writable: writable });
      var dialog = document.getElementById('dialog');
      var form = el('form', { method: 'dialog' },
        el('div', { class: 'st-dialog-head' }, el('h2', { text: t('access.personalTokens') })),
        el('div', { class: 'st-dialog-body' }, el('p', { class: 'st-help', text: t('access.tokenShown') }), el('code', { class: 'st-code', text: data.token })),
        el('div', { class: 'st-dialog-foot' }, el('span', { class: 'st-spacer' }), copyButton(data.token), el('button', { type: 'submit', class: 'st-btn primary', text: t('common.close') })));
      dialog.textContent = '';
      dialog.appendChild(form);
      dialog.showModal();
      loadTokens();
    } catch (error) { toast(error.message, true); }
  }
  loadTokens();
}

function copyButton(value) {
  var button = el('button', { type: 'button', class: 'st-btn', text: t('common.copy') });
  button.onclick = async function () {
    try { await navigator.clipboard.writeText(value); button.textContent = t('common.copied'); setTimeout(function () { button.textContent = t('common.copy'); }, 1500); }
    catch (e) { toast(t('common.error'), true); }
  };
  return button;
}

async function rotate(kind, label) {
  if (!confirm(t('access.generateConfirm', { k: label }))) return;
  try {
    var data = await api('/api/admin/tokens/rotate', { kind: kind });
    state = data.state;
    var dialog = document.getElementById('dialog');
    var form = el('form', { method: 'dialog' },
      el('div', { class: 'st-dialog-head' }, el('h2', { text: t('access.tokenTitle', { k: label }) })),
      el('div', { class: 'st-dialog-body' }, el('p', { class: 'st-help', text: t('access.tokenBody') }), el('code', { class: 'st-code', text: data.token }),
        data.applied === 'scheduled' ? el('p', { class: 'st-help', text: t('access.tokenRestart') }) : null),
      el('div', { class: 'st-dialog-foot' }, el('span', { class: 'st-spacer' }), copyButton(data.token), el('button', { type: 'submit', class: 'st-btn primary', text: t('common.close') })));
    dialog.textContent = '';
    dialog.appendChild(form);
    dialog.addEventListener('close', function once() { dialog.removeEventListener('close', once); applied(data.applied); }, { once: true });
    dialog.showModal();
  } catch (error) {
    toast(error.message, true);
  }
}

// ---------------------------------------------------------------------------
// Settings page
// ---------------------------------------------------------------------------

function section(id, title, lede) {
  return el('section', { class: 'st-section', id: id, 'aria-labelledby': id + '-title' },
    el('h2', { id: id + '-title', text: title }), lede ? el('p', { class: 'st-lede', text: lede }) : null);
}

function renderSettings() {
  app.textContent = '';
  forms = {};
  var nav = el('nav', { class: 'st-nav', 'aria-label': t('nav.settings') });
  var main = el('main', { class: 'st-main' });
  var all = [{ id: 'mailboxes', title: t('mb.title') }].concat(BOOT.sections);
  all.forEach(function (s) { nav.appendChild(el('a', { href: '#' + s.id, text: s.title })); });

  var mb = section('mailboxes', t('mb.title'), t('mb.lede'));
  var mbList = el('div', { 'data-mailboxes': '' });
  mb.appendChild(mbList);
  renderMailboxes(mbList);
  var oauthSection = el('details', { class: 'st-more', id: 'oauth' }, el('summary', { text: BOOT.oauthTitle }),
    el('p', { class: 'st-lede', text: t('oauth.lede') }), makeForm('oauth', fieldsOf('oauth'), {}).node);
  oauthSection.style.marginTop = '24px';
  mb.appendChild(oauthSection);
  main.appendChild(mb);

  BOOT.sections.forEach(function (s) {
    var node = section(s.id, s.title, S[s.id + '.lede']);
    if (s.id === 'access') renderAccess(node);
    var fields = fieldsOf(s.id);
    if (fields.length) {
      var options = {};
      if (s.id === 'ai') options.test = '/api/admin/test/model';
      if (s.id === 'notifications') { options.test = '/api/admin/test/notifications'; options.testLabel = t('notifications.test'); }
      node.appendChild(makeForm(s.id, fields, options).node);
    }
    main.appendChild(node);
  });
  app.appendChild(nav);
  app.appendChild(main);
  if (state.readOnlyShared) markSharedReadOnly();
  watchNav(nav);
  if (location.hash) { var target = document.getElementById(location.hash.slice(1)); if (target) target.scrollIntoView(); }
}

/** A member sees the shared sections, but cannot change them. */
function markSharedReadOnly() {
  ['ai', 'notifications', 'triage', 'schedule', 'privacy', 'sending', 'oauth', 'advanced', 'access'].forEach(function (id) {
    var node = document.getElementById(id);
    if (!node) return;
    // Personal fields (your own "About you", rules, language, digest hour and
    // outputs) stay editable; only controls belonging to the whole instance
    // are locked.
    node.querySelectorAll('[data-key]').forEach(function (field) {
      if (field.getAttribute('data-personal') === '1' || field.getAttribute('data-overridable') === '1') return;
      field.querySelectorAll('input,select,textarea,button').forEach(function (control) { control.disabled = true; });
    });
    node.querySelectorAll('.st-owner-only input,.st-owner-only button').forEach(function (control) { control.disabled = true; });
    var note = el('p', { class: 'st-lede', text: t('shared.readOnly') });
    node.insertBefore(note, node.children[1] || null);
  });
}

function watchNav(nav) {
  var links = Array.prototype.slice.call(nav.querySelectorAll('a'));
  // Jumping between sections replaces the address rather than adding to history, so "Back to mail" is one step.
  links.forEach(function (link) {
    link.addEventListener('click', function (event) {
      var target = document.getElementById(link.getAttribute('href').slice(1));
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView();
      history.replaceState(null, '', link.getAttribute('href'));
    });
  });
  function mark() {
    var current = links[0];
    links.forEach(function (link) {
      var target = document.getElementById(link.getAttribute('href').slice(1));
      if (target && target.getBoundingClientRect().top < 120) current = link;
    });
    links.forEach(function (link) { link.classList.toggle('on', link === current); });
  }
  window.addEventListener('scroll', mark, { passive: true });
  mark();
}

// ---------------------------------------------------------------------------
// Setup steps
// ---------------------------------------------------------------------------

var step = 1;
var setupNext = null;

function readyCount() { return state.mailboxes.filter(function (m) { return m.readiness === 'ready'; }).length; }
function updateSetupNav() {
  if (setupNext && step === 1) setupNext.disabled = readyCount() === 0;
  var hint = document.getElementById('setup-hint');
  if (hint) hint.hidden = readyCount() > 0;
}

function goto(next) {
  step = next;
  history.replaceState(null, '', '#step-' + step);
  renderSetup();
  window.scrollTo(0, 0);
}

function renderSetup() {
  app.textContent = '';
  forms = {};
  var main = el('main', { class: 'st-main' });
  var steps = el('ol', { class: 'st-steps' });
  [1, 2, 3, 4].forEach(function (n) { steps.appendChild(el('li', { class: n < step ? 'done' : (n === step ? 'on' : ''), 'aria-current': n === step ? 'step' : null, text: t('setup.step' + n) })); });
  main.appendChild(steps);
  var node = section('step', t('setup.step' + step), t('setup.intro' + step));
  var foot = el('div', { class: 'st-foot' });
  setupNext = null;
  if (step === 1) {
    var list = el('div', { 'data-mailboxes': '' });
    node.appendChild(list);
    renderMailboxes(list);
    node.appendChild(el('p', { class: 'st-help', id: 'setup-hint', text: t('setup.needMailbox'), style: 'margin-top:16px' }));
    setupNext = el('button', { type: 'button', class: 'st-btn primary', text: t('setup.next'), onclick: function () { goto(2); } });
    foot.appendChild(setupNext);
  } else if (step === 2 || step === 3) {
    var id = step === 2 ? 'ai' : 'notifications';
    var fields = fieldsOf(id, false);
    var form = makeForm(id, fields, {
      test: step === 2 ? '/api/admin/test/model' : '/api/admin/test/notifications',
      testLabel: step === 3 ? t('notifications.test') : undefined,
      saveLabel: t('setup.saveNext'),
      after: function () { goto(step + 1); },
    });
    node.appendChild(form.node);
    var formFoot = form.node.querySelector('.st-foot');
    formFoot.insertBefore(el('button', { type: 'button', class: 'st-btn', text: t('setup.back'), onclick: function () { goto(step - 1); } }), formFoot.firstChild);
    formFoot.insertBefore(el('button', { type: 'button', class: 'st-btn', text: t('setup.skip'), onclick: function () { goto(step + 1); } }), formFoot.children[2]);
    form.saveButton.disabled = false;
    form.onChange = function () {};
    foot = null;
  } else {
    var ready = readyCount();
    var waitingAuth = state.mailboxes.filter(function (m) { return m.readiness === 'needs-authorization'; }).length;
    var notify = [];
    if (state.secrets.FEISHU_WEBHOOK_URL) notify.push('Feishu');
    if (state.secrets.WEBHOOK_URL) notify.push('Webhook');
    var summary = el('ul', { class: 'st-summary' },
      el('li', null, el('span', { text: t('setup.sumMailboxes') }), el('span', { text: t('setup.ready', { n: ready }) + (waitingAuth ? ' · ' + t('setup.waiting', { n: waitingAuth }) : '') })),
      el('li', null, el('span', { text: t('setup.sumModel') }), el('span', { text: state.secrets.LLM_API_KEY ? ((state.values.LLM_PROVIDER || state.values.LLM_BASE_URL || 'deepseek') + ' · ' + (state.values.LLM_MODEL || 'deepseek-flash')) : t('setup.modelNone') })),
      el('li', null, el('span', { text: t('setup.sumNotify') }), el('span', { text: notify.length ? notify.join(', ') : t('setup.notifyNone') })),
      el('li', null, el('span', { text: t('setup.sumTz') }), el('span', { text: state.values.TZ || state.timeZone })));
    node.appendChild(summary);
    var start = el('button', { type: 'button', class: 'st-btn primary', text: t('setup.start') });
    start.disabled = ready === 0;
    start.onclick = async function () {
      start.disabled = true;
      try {
        var data = await api('/api/admin/setup/finish', {});
        state = data.state;
        if (data.applied === 'manual') { banner(t('banner.manual'), 'warn'); return; }
        waitForRestart(function () { location.replace('/'); }, t('setup.starting'));
      } catch (error) {
        toast(error.message, true);
        start.disabled = false;
      }
    };
    foot.appendChild(el('button', { type: 'button', class: 'st-btn', text: t('setup.back'), onclick: function () { goto(3); } }));
    foot.appendChild(start);
  }
  if (foot) node.appendChild(foot);
  main.appendChild(node);
  app.appendChild(main);
  updateSetupNav();
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

function render() {
  if (BOOT.mode === 'setup') renderSetup(); else renderSettings();
  app.setAttribute('aria-busy', 'false');
}

async function load() {
  state = await api('/api/admin/state');
  render();
  updateIdleBanner();
}

function dirtyForms() {
  return Object.keys(forms).some(function (id) { return id !== 'mb-oauth' && Object.keys(changes(forms[id])).length > 0; });
}

function relabelHeader() {
  var title = t(BOOT.mode === 'setup' ? 'nav.setup' : 'nav.settings');
  document.documentElement.lang = lang;
  document.title = title + ' · mailsift';
  document.getElementById('crumb').textContent = title;
  var back = document.getElementById('back');
  if (back) back.textContent = t('nav.back');
  document.getElementById('lang').textContent = t('lang.face');
  document.getElementById('signout').textContent = t('nav.signout');
}

function handleReturn() {
  var params = new URLSearchParams(location.search);
  var outcome = params.get('oauth');
  if (!outcome) return;
  var id = params.get('mailbox');
  history.replaceState(null, '', location.pathname + location.hash);
  if (outcome === 'ok') {
    toast(t('oauth.ok'));
    var m = state.mailboxes.find(function (x) { return x.id === id; });
    if (m && m.readiness === 'ready') whenSettled(function () { testSaved(m); });
  } else {
    toast(t('oauth.' + (outcome === 'denied' ? 'denied' : outcome === 'expired' ? 'expired' : 'failed')), true);
  }
}

document.getElementById('lang').onclick = function () {
  if (dirtyForms() && !confirm(t('common.switchLose'))) return;
  var dialog = document.getElementById('dialog');
  if (dialog.open) dialog.close();
  storeLanguage(BOOT.nextLang);
  applyLocale(BOOT.nextLang);
  relabelHeader();
  render();
  if (!waiting) updateIdleBanner();
};
var backLink = document.getElementById('back');
if (backLink) backLink.onclick = function (event) {
  if (cameFromMail && history.length > 1) { event.preventDefault(); history.back(); }
};
window.addEventListener('beforeunload', function (event) {
  if (dirtyForms()) { event.preventDefault(); event.returnValue = ''; }
});

if (BOOT.mode === 'setup') {
  var match = /^#step-([1-4])$/.exec(location.hash);
  if (match) step = Number(match[1]);
}
render();
updateIdleBanner();
handleReturn();
if (cameFromMail && !location.search.includes('oauth=')) history.replaceState(null, '', location.pathname + location.hash);
})();
`;
