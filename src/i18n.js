// Arabic is the default interface language; English is one tap away.
// Strings use {name} placeholders.

export const INITIATIVE_LINE = 'مبادرة رفع ملفات درايف مقدمة من جمعية أفياء النسائية بمنطقة عسير';

const en = {
  appName: 'Drive File Upload Initiative',
  langSwitch: 'العربية',
  langSwitchLabel: 'التبديل إلى العربية',
  landingDesc:
    'Upload your files to Google Drive quickly and easily while maintaining file quality, with an optional feature to mute video audio before uploading.',
  signIn: 'Sign in with Google',
  continueAs: 'Continue as {email}',
  useOtherAccount: 'Use a different account',
  signingIn: 'Opening Google…',
  landingTrust1: 'Files go straight from your device to your own Google Drive.',
  landingTrust2: 'We never see your password and never keep copies of your files.',
  landingTrust3: 'Free for everyone. No plans, no payments.',
  demoNotice: 'Demo mode — Google sign-in is not configured on this server, so uploads are simulated.',
  tryDemo: 'Try the demo',
  signInFailed: 'Sign-in was not completed. Please try again.',
  popupBlocked: 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.',
  inAppBrowser: 'Google doesn’t allow signing in from inside this app’s built-in browser. Open this page in Safari or Chrome (use the ⋯ menu → “Open in browser”), then sign in.',
  iosTip: 'Tip for iPhone: choosing videos from “Photo Library” can take a while because iOS prepares a copy first. “Choose File” (Files app) is usually much faster.',
  filesUploaded: '{done} / {total} files uploaded',
  noFilesReceived: 'The selected files didn’t reach the page. Please try again, or choose fewer files at a time.',
  pickerReloaded: 'Your iPhone reloaded this page while preparing the selected files (this happens with many or very large videos, because iOS makes a copy of each one first). Please choose fewer files at a time, or pick them from “Choose File” (Files app) instead of the Photo Library.',
  showMore: 'Show more',
  scopeMissing: 'Google Drive access was not granted. Please sign in again and allow access so files can be uploaded.',

  navUpload: 'Upload',
  navHistory: 'History',
  signOut: 'Sign out',
  disconnect: 'Disconnect from Google',
  disconnectConfirm:
    'This removes this app’s access to your Google account and clears upload data saved on this device. Files already in your Drive are not affected. Continue?',
  accountMenu: 'Account',
  welcome: 'Welcome, {name}',
  signedInAs: 'Signed in as {email}',

  stepDestination: 'Upload destination',
  stepFiles: 'Files',
  stepOptions: 'Options',
  currentFolder: 'Current upload folder:',
  noFolder: 'Choose where your files should go.',
  selectFolder: 'Select Google Drive folder',
  changeFolder: 'Change folder',
  myDrive: 'My Drive',
  useMyDrive: 'Use My Drive',
  newFolder: 'New folder',
  newFolderPrompt: 'Name of the new folder',
  newFolderIn: 'It will be created inside “{folder}”.',
  create: 'Create',
  cancel: 'Cancel',
  close: 'Close',
  openInDrive: 'Open in Google Drive',
  folderChecking: 'Checking folder…',
  folderNoPermission: 'You don’t have permission to add files to this folder. Please select another folder.',
  folderGone: 'This folder is no longer available. Please select another folder.',
  pickerTitle: 'Choose a folder for your uploads',

  dropTitle: 'Drag and drop files here or click to select files',
  dropTitleTouch: 'Tap to choose photos, videos or files',
  dropHint: 'Any file type. Large videos are fine.',
  chooseFiles: 'Choose files',
  chooseFolder: 'Choose a folder',
  selectedSummary: '{count} files · {size}',
  selectedOne: '1 file · {size}',
  clearSelection: 'Clear',
  readingFolder: 'Reading folder… {count} files found',

  optMute: 'Mute all video files',
  optMuteHelp:
    'Removes the sound from every video before it is uploaded. The picture is kept exactly as it is. The uploaded copy will have no audio — your original on this device is not changed.',
  optMuteVideos: '{count} videos will be muted on this device.',
  optResume: 'Automatically resume uploads after connection recovery',
  optResumeHelp: 'If your internet drops, uploading continues on its own when you’re back online.',

  start: 'Start upload',
  startNeedFolder: 'Select a folder first',
  startNeedFiles: 'Add files first',
  preparing: 'Preparing…',
  checkingDest: 'Checking for files with the same name…',

  progressTitle: 'Upload progress',
  overall: 'Overall progress',
  statTotal: 'Total files',
  statUploaded: 'Uploaded',
  statUploading: 'Uploading',
  statWaiting: 'Waiting',
  statFailed: 'Failed',
  statSize: 'Total size',
  eta: 'About {time} left',
  etaCalculating: 'Estimating time left…',
  speed: '{speed}/s',
  uploadingTo: 'Uploading to {folder}',

  pause: 'Pause',
  resume: 'Resume',
  retryFailed: 'Retry failed files',
  cancelAll: 'Cancel all',
  cancelAllConfirm:
    'Stop all remaining uploads? Files that have already finished uploading stay safely in your Google Drive.',
  cancelAllYes: 'Stop uploads',
  keepUploading: 'Keep uploading',
  cancelFile: 'Cancel {name}',
  retryFile: 'Retry {name}',
  uploadWithSound: 'Upload with sound',

  filterAll: 'All',
  filterActive: 'In progress',
  filterDone: 'Uploaded',
  filterFailed: 'Failed',
  emptyFilter: 'Nothing here right now.',
  moreRows: 'Showing {shown} of {total}.',

  st_waiting: 'Waiting',
  st_processing: 'Processing',
  st_uploading: 'Uploading',
  st_uploaded: 'Uploaded',
  st_failed: 'Failed',
  st_retrying: 'Retrying',
  st_paused: 'Paused',
  st_cancelled: 'Cancelled',
  st_skipped: 'Skipped',
  processingMute: 'Removing sound',

  k_video: 'Video',
  k_image: 'Image',
  k_audio: 'Audio',
  k_pdf: 'PDF',
  k_doc: 'Document',
  k_sheet: 'Spreadsheet',
  k_slides: 'Presentation',
  k_archive: 'Archive',
  k_other: 'File',
  mutedTag: 'Muted',

  doneTitle: 'Upload completed',
  doneBody: '{ok} of {total} files are now in “{folder}”.',
  doneWithFailures: '{failed} files couldn’t be uploaded. You can try them again.',
  uploadMore: 'Upload more files',

  bannerOffline:
    'Your internet connection was interrupted. Uploading will resume automatically when the connection is restored.',
  bannerOfflineManual: 'Your internet connection was interrupted. Press Resume when you’re back online.',
  bannerOnlineManual: 'You’re back online. Press Resume to continue uploading.',
  bannerPaused: 'Uploads are paused. Finished files are safe in your Drive.',
  bannerAuth: 'To keep uploading, please confirm your Google account.',
  bannerAuthBtn: 'Continue',
  bannerQuota: 'Your Google Drive is full. Free up space in Drive, then retry the failed files.',
  bannerPermission: 'You don’t have permission to access this folder. Please select another folder.',
  leaveWarning: 'Uploads are still running. If you leave, unfinished files will stop.',
  resumeNotice:
    'An earlier upload to “{folder}” didn’t finish ({left} of {total} files left). Select the same files again to continue — files that already finished will be skipped.',
  dismiss: 'Dismiss',

  err_network: 'Connection problem. We’ll try again automatically.',
  err_retrying: 'We couldn’t upload this file. We’ll try again automatically.',
  err_generic: 'We couldn’t upload this file. Please try again.',
  err_quota: 'Your Google Drive is full.',
  err_permission: 'You don’t have permission to add files to this folder.',
  err_muteFailed: 'We couldn’t remove the sound from this video. You can upload it with sound or cancel it.',
  err_muteTooBig: 'This video is too large to mute on this device.',
  err_readFile: 'This file couldn’t be read from your device. It may have been moved or deleted.',
  err_folderGone: 'The upload folder is no longer available.',
  alreadyUploaded: 'Already uploaded earlier',
  technicalDetails: 'Technical details',

  dupTitle: 'Files with the same name',
  dupIntro: 'A file with this name already exists. What would you like to do?',
  dupIntroMany: '{count} files already exist in this folder with the same name. What would you like to do?',
  dupNew: 'Upload as a new copy',
  dupReplace: 'Replace the existing file',
  dupSkip: 'Skip the file',
  dupApplyAll: 'For all files:',
  dupReplaceNote:
    'Replacing uploads your file as a new version of the existing one. Google Drive keeps the previous version in the file’s version history.',
  dupNoReplace: 'Can’t be replaced',
  continue: 'Continue',

  bigTitle: 'Videos too large to mute here',
  bigBody:
    '{count} videos are too large to have their sound removed on this device. They will not be sent anywhere else for processing. What would you like to do?',
  bigUploadSound: 'Upload them with sound',
  bigSkip: 'Skip these videos',

  historyTitle: 'Upload history',
  historyIntro: 'Only you can see this list. It is stored privately in your own Google Drive.',
  historyEmpty: 'No uploads yet. Your finished uploads will be listed here.',
  historyLoading: 'Loading your history…',
  historyFailed: 'Your history couldn’t be loaded right now.',
  hDate: 'Date',
  hFolder: 'Folder',
  hFiles: 'Files',
  hSize: 'Size',
  hOk: 'Uploaded',
  hFailed: 'Failed',
  hMuted: '{count} muted',
  clearHistory: 'Clear history',
  clearHistoryConfirm: 'Clear your upload history? Your files in Google Drive are not affected.',

  privacyLink: 'Privacy policy',
  footerPrivacy: 'Your files go directly to your Google Drive. Nothing is stored on our servers.',
  debugToggle: 'Advanced: connection details',
  simulateOffline: 'Simulate connection loss (demo)',
  confirm: 'Confirm',
  yes: 'Yes',
  units: ['B', 'KB', 'MB', 'GB', 'TB'],
  minutes: '{n} min',
  hours: '{h} h {m} min',
  seconds: 'less than a minute',
};

const ar = {
  appName: 'مبادرة رفع ملفات درايف',
  langSwitch: 'English',
  langSwitchLabel: 'Switch to English',
  landingDesc:
    'ارفعي ملفاتك إلى Google Drive بسرعة وسهولة مع الحفاظ على جودتها، مع خيار لكتم صوت مقاطع الفيديو قبل رفعها.',
  signIn: 'تسجيل الدخول باستخدام Google',
  continueAs: 'المتابعة باسم {email}',
  useOtherAccount: 'استخدام حساب آخر',
  signingIn: 'جارٍ فتح Google…',
  landingTrust1: 'تنتقل الملفات من جهازك إلى حسابك في Google Drive مباشرة.',
  landingTrust2: 'لا نطّلع على كلمة مرورك، ولا نحتفظ بأي نسخة من ملفاتك.',
  landingTrust3: 'مجانية للجميع، بلا اشتراكات أو مدفوعات.',
  demoNotice: 'وضع التجربة — لم يُضبط تسجيل الدخول بـ Google على هذا الخادم، لذلك الرفع هنا محاكاة.',
  tryDemo: 'جرّبي النسخة التجريبية',
  signInFailed: 'لم يكتمل تسجيل الدخول. حاولي مرة أخرى.',
  popupBlocked: 'منع المتصفح نافذة تسجيل الدخول. اسمحي بالنوافذ المنبثقة لهذا الموقع ثم حاولي مجددًا.',
  inAppBrowser: 'لا تسمح Google بتسجيل الدخول من المتصفح المدمج داخل هذا التطبيق. افتحي الصفحة في Safari أو Chrome (من قائمة ⋯ ← «فتح في المتصفح») ثم سجّلي الدخول.',
  iosTip: 'نصيحة لمستخدمات iPhone: اختيار الفيديوهات من «مكتبة الصور» قد يستغرق وقتًا لأن iOS يجهّز نسخة منها أولًا، أما «اختيار ملف» (تطبيق الملفات) فهو أسرع عادةً.',
  filesUploaded: 'تم رفع {done} من {total} ملف',
  noFilesReceived: 'لم تصل الملفات المختارة إلى الصفحة. حاولي مرة أخرى، أو اختاري عددًا أقل في كل مرة.',
  pickerReloaded: 'أعاد iPhone تحميل الصفحة أثناء تجهيز الملفات المختارة (يحدث هذا مع الفيديوهات الكثيرة أو الكبيرة جدًا لأن iOS يجهّز نسخة من كل ملف أولًا). اختاري عددًا أقل في كل مرة، أو اختاري الملفات من «اختيار ملف» (تطبيق الملفات) بدل «مكتبة الصور».',
  showMore: 'عرض المزيد',
  scopeMissing: 'لم يُمنح إذن الوصول إلى Google Drive. سجّلي الدخول مجددًا واسمحي بالوصول ليتم رفع الملفات.',

  navUpload: 'الرفع',
  navHistory: 'السجل',
  signOut: 'تسجيل الخروج',
  disconnect: 'فصل الحساب عن Google',
  disconnectConfirm:
    'سيُلغى وصول هذا التطبيق إلى حسابك في Google وتُحذف بيانات الرفع المحفوظة على هذا الجهاز. لن تتأثر ملفاتك الموجودة في Drive. هل تريدين المتابعة؟',
  accountMenu: 'الحساب',
  welcome: 'أهلًا {name}',
  signedInAs: 'مسجّلة باسم {email}',

  stepDestination: 'مكان الرفع',
  stepFiles: 'الملفات',
  stepOptions: 'الخيارات',
  currentFolder: 'مجلد الرفع الحالي:',
  noFolder: 'اختاري المكان الذي ستُرفع إليه ملفاتك.',
  selectFolder: 'اختيار مجلد من Google Drive',
  changeFolder: 'تغيير المجلد',
  myDrive: 'ملفاتي في درايف',
  useMyDrive: 'الرفع إلى ملفاتي',
  newFolder: 'مجلد جديد',
  newFolderPrompt: 'اسم المجلد الجديد',
  newFolderIn: 'سيُنشأ داخل «{folder}».',
  create: 'إنشاء',
  cancel: 'إلغاء',
  close: 'إغلاق',
  openInDrive: 'فتح في Google Drive',
  folderChecking: 'جارٍ التحقق من المجلد…',
  folderNoPermission: 'ليست لديك صلاحية إضافة ملفات إلى هذا المجلد. يُرجى اختيار مجلد آخر.',
  folderGone: 'هذا المجلد لم يعد متاحًا. يُرجى اختيار مجلد آخر.',
  pickerTitle: 'اختاري مجلدًا لرفع ملفاتك',

  dropTitle: 'اسحبي الملفات وأفلتيها هنا أو انقري لاختيار الملفات',
  dropTitleTouch: 'اضغطي لاختيار الصور أو الفيديوهات أو الملفات',
  dropHint: 'جميع أنواع الملفات، والفيديوهات الكبيرة أيضًا.',
  chooseFiles: 'اختيار ملفات',
  chooseFolder: 'اختيار مجلد',
  selectedSummary: '{count} ملف · {size}',
  selectedOne: 'ملف واحد · {size}',
  clearSelection: 'مسح',
  readingFolder: 'جارٍ قراءة المجلد… {count} ملف',

  optMute: 'كتم صوت جميع ملفات الفيديو',
  optMuteHelp:
    'يُزال الصوت من كل فيديو قبل رفعه، وتبقى الصورة كما هي تمامًا. النسخة المرفوعة ستكون بلا صوت، أما الأصل على جهازك فلا يتغير.',
  optMuteVideos: 'سيُكتم صوت {count} فيديو على جهازك.',
  optResume: 'استئناف الرفع تلقائيًا بعد عودة الاتصال',
  optResumeHelp: 'إذا انقطع الإنترنت، يُستأنف الرفع وحده عند عودة الاتصال.',

  start: 'بدء الرفع',
  startNeedFolder: 'اختاري مجلدًا أولًا',
  startNeedFiles: 'أضيفي ملفات أولًا',
  preparing: 'جارٍ التجهيز…',
  checkingDest: 'جارٍ البحث عن ملفات بالاسم نفسه…',

  progressTitle: 'تقدّم الرفع',
  overall: 'التقدّم الكلي',
  statTotal: 'إجمالي الملفات',
  statUploaded: 'تم رفعها',
  statUploading: 'قيد الرفع',
  statWaiting: 'في الانتظار',
  statFailed: 'لم تُرفع',
  statSize: 'الحجم الكلي',
  eta: 'متبقٍّ حوالي {time}',
  etaCalculating: 'جارٍ حساب الوقت المتبقي…',
  speed: '{speed}/ث',
  uploadingTo: 'الرفع إلى {folder}',

  pause: 'إيقاف مؤقت',
  resume: 'استئناف',
  retryFailed: 'إعادة محاولة الملفات المتعثرة',
  cancelAll: 'إلغاء الكل',
  cancelAllConfirm: 'إيقاف كل الملفات المتبقية؟ الملفات التي اكتمل رفعها تبقى محفوظة في Google Drive.',
  cancelAllYes: 'إيقاف الرفع',
  keepUploading: 'متابعة الرفع',
  cancelFile: 'إلغاء {name}',
  retryFile: 'إعادة محاولة {name}',
  uploadWithSound: 'رفعه بالصوت',

  filterAll: 'الكل',
  filterActive: 'قيد التنفيذ',
  filterDone: 'تم رفعها',
  filterFailed: 'متعثرة',
  emptyFilter: 'لا شيء هنا حاليًا.',
  moreRows: 'يظهر {shown} من {total}.',

  st_waiting: 'في الانتظار',
  st_processing: 'قيد المعالجة',
  st_uploading: 'قيد الرفع',
  st_uploaded: 'تم الرفع',
  st_failed: 'تعذّر الرفع',
  st_retrying: 'إعادة المحاولة',
  st_paused: 'متوقف مؤقتًا',
  st_cancelled: 'أُلغي',
  st_skipped: 'تم تخطيه',
  processingMute: 'إزالة الصوت',

  k_video: 'فيديو',
  k_image: 'صورة',
  k_audio: 'صوت',
  k_pdf: 'PDF',
  k_doc: 'مستند',
  k_sheet: 'جدول',
  k_slides: 'عرض تقديمي',
  k_archive: 'ملف مضغوط',
  k_other: 'ملف',
  mutedTag: 'بلا صوت',

  doneTitle: 'اكتمل الرفع',
  doneBody: 'أصبح {ok} من {total} ملف في «{folder}».',
  doneWithFailures: 'تعذّر رفع {failed} ملف. يمكنك إعادة المحاولة.',
  uploadMore: 'رفع ملفات أخرى',

  bannerOffline: 'انقطع اتصالك بالإنترنت. سيُستأنف الرفع تلقائيًا عند عودة الاتصال.',
  bannerOfflineManual: 'انقطع اتصالك بالإنترنت. اضغطي «استئناف» عند عودة الاتصال.',
  bannerOnlineManual: 'عاد الاتصال. اضغطي «استئناف» لمتابعة الرفع.',
  bannerPaused: 'الرفع متوقف مؤقتًا. الملفات المكتملة محفوظة في Drive.',
  bannerAuth: 'لمتابعة الرفع، يُرجى تأكيد حسابك في Google.',
  bannerAuthBtn: 'متابعة',
  bannerQuota: 'مساحة Google Drive ممتلئة. أفرغي بعض المساحة ثم أعيدي محاولة الملفات المتعثرة.',
  bannerPermission: 'ليست لديك صلاحية الوصول إلى هذا المجلد. يُرجى اختيار مجلد آخر.',
  leaveWarning: 'ما زال الرفع جاريًا. إذا غادرتِ الصفحة ستتوقف الملفات غير المكتملة.',
  resumeNotice:
    'لم يكتمل رفع سابق إلى «{folder}» (بقي {left} من {total} ملف). اختاري الملفات نفسها مجددًا للمتابعة — وسيتم تخطي ما اكتمل رفعه.',
  dismiss: 'إخفاء',

  err_network: 'مشكلة في الاتصال. سنعيد المحاولة تلقائيًا.',
  err_retrying: 'تعذّر رفع هذا الملف. سنعيد المحاولة تلقائيًا.',
  err_generic: 'تعذّر رفع هذا الملف. يُرجى المحاولة مرة أخرى.',
  err_quota: 'مساحة Google Drive ممتلئة.',
  err_permission: 'ليست لديك صلاحية إضافة ملفات إلى هذا المجلد.',
  err_muteFailed: 'تعذّرت إزالة الصوت من هذا الفيديو. يمكنك رفعه بالصوت أو إلغاؤه.',
  err_muteTooBig: 'هذا الفيديو أكبر من أن يُكتم صوته على هذا الجهاز.',
  err_readFile: 'تعذّرت قراءة هذا الملف من جهازك. ربما نُقل أو حُذف.',
  err_folderGone: 'مجلد الرفع لم يعد متاحًا.',
  alreadyUploaded: 'رُفع سابقًا',
  technicalDetails: 'تفاصيل تقنية',

  dupTitle: 'ملفات بالاسم نفسه',
  dupIntro: 'يوجد ملف بهذا الاسم بالفعل. ماذا تريدين أن تفعلي؟',
  dupIntroMany: 'يوجد {count} ملف بالاسم نفسه في هذا المجلد. ماذا تريدين أن تفعلي؟',
  dupNew: 'رفعه كنسخة جديدة',
  dupReplace: 'استبدال الملف الموجود',
  dupSkip: 'تخطي الملف',
  dupApplyAll: 'لجميع الملفات:',
  dupReplaceNote:
    'عند الاستبدال يُرفع ملفك كإصدار جديد من الملف الموجود، ويحتفظ Google Drive بالإصدار السابق في سجل إصدارات الملف.',
  dupNoReplace: 'لا يمكن استبداله',
  continue: 'متابعة',

  bigTitle: 'فيديوهات أكبر من أن يُكتم صوتها هنا',
  bigBody:
    '{count} فيديو أكبر من أن يُزال صوتها على هذا الجهاز، ولن تُرسل إلى أي جهة أخرى لمعالجتها. ماذا تريدين أن تفعلي؟',
  bigUploadSound: 'رفعها بالصوت',
  bigSkip: 'تخطي هذه الفيديوهات',

  historyTitle: 'سجل الرفع',
  historyIntro: 'هذه القائمة لا يراها أحد غيرك، وهي محفوظة بشكل خاص في حسابك على Google Drive.',
  historyEmpty: 'لا توجد عمليات رفع بعد. ستظهر هنا عمليات الرفع المكتملة.',
  historyLoading: 'جارٍ تحميل السجل…',
  historyFailed: 'تعذّر تحميل السجل حاليًا.',
  hDate: 'التاريخ',
  hFolder: 'المجلد',
  hFiles: 'الملفات',
  hSize: 'الحجم',
  hOk: 'تم رفعها',
  hFailed: 'متعثرة',
  hMuted: '{count} بلا صوت',
  clearHistory: 'مسح السجل',
  clearHistoryConfirm: 'مسح سجل الرفع؟ لن تتأثر ملفاتك في Google Drive.',

  privacyLink: 'سياسة الخصوصية',
  footerPrivacy: 'تذهب ملفاتك مباشرة إلى Google Drive الخاص بك، ولا يُحفظ شيء على خوادمنا.',
  debugToggle: 'متقدم: تفاصيل الاتصال',
  simulateOffline: 'محاكاة انقطاع الاتصال (تجربة)',
  confirm: 'تأكيد',
  yes: 'نعم',
  units: ['بايت', 'ك.ب', 'م.ب', 'ج.ب', 'ت.ب'],
  minutes: '{n} دقيقة',
  hours: '{h} ساعة و{m} دقيقة',
  seconds: 'أقل من دقيقة',
};

const dicts = { en, ar };
let lang = (() => {
  try {
    const saved = localStorage.getItem('lang');
    if (saved === 'en' || saved === 'ar') return saved;
  } catch {}
  return 'ar';
})();

export function getLang() {
  return lang;
}

export function setLang(next) {
  lang = next;
  try {
    localStorage.setItem('lang', next);
  } catch {}
  applyDocumentLang();
}

export function applyDocumentLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.title = dicts[lang].appName;
}

export function t(key, vars) {
  let s = dicts[lang][key] ?? dicts.en[key] ?? key;
  if (vars && typeof s === 'string') {
    s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
  }
  return s;
}

const numFmt = () => new Intl.NumberFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US');

export function fmtNum(n) {
  return numFmt().format(n);
}

export function fmtBytes(bytes) {
  const units = dicts[lang].units;
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const digits = i === 0 ? 0 : v < 10 ? 1 : 0;
  return `${new Intl.NumberFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(v)} ${units[i]}`;
}

export function fmtDuration(sec) {
  if (sec < 60) return t('seconds');
  const m = Math.round(sec / 60);
  if (m < 60) return t('minutes', { n: fmtNum(m) });
  return t('hours', { h: fmtNum(Math.floor(m / 60)), m: fmtNum(m % 60) });
}

export function fmtDate(ts) {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(ts));
}
