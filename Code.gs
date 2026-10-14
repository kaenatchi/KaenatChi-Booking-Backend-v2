/**
 * KaenatChi Booking Core — clean staging rebuild.
 * This file is intentionally independent of the legacy booking implementation.
 * No CMS writes. No production deployment. Configure Script Properties before use.
 */
const CORE = Object.freeze({
  TZ: 'Asia/Tehran',
  // IDs are injected only through this STAGING script's private properties.
  // Never hardcode live CMS/VIP spreadsheet IDs into source.
  CMS_API_URL_PROP: 'CMS_API_URL',
  CMS_ID_PROP: 'CMS_SPREADSHEET_ID',
  VIP_ID_PROP: 'VIP_SPREADSHEET_ID',
  STAGING_PROP: 'STAGING_SPREADSHEET_ID',
  ADMIN_SECRET_PROP: 'ADMIN_KEY',
  BOT_TOKEN_PROP: 'KAENATCHI_TELEGRAM_BOT_TOKEN',
  WEBHOOK_SECRET_PROP: 'KAENATCHI_TELEGRAM_WEBHOOK_SECRET',
  ADMIN_CHAT_PROP: 'KAENATCHI_TELEGRAM_ADMIN_CHAT_ID',
  TABS: {
    BOOKINGS: 'Bookings',
    PAYMENTS: 'Payments',
    LOGS: 'BookingLogs',
    CLOSURES: 'Closures'
  },
  HEADERS: {
    Bookings: ['Request ID','Tracking Code','Appointment Code','Status','First Name','Last Name','Phone','Appointment Date','Appointment Time','Service IDs','Service Names','Subtotal','Discount Code','Discount Amount','Total','Created At','Request Expires At','Payment Expires At','Receipt File ID','Receipt MIME Type','Transaction Ref','Decision At','Decision By','Reschedule From','Requested Reschedule Date','Requested Reschedule Time','Updated At'],
    Payments: ['Payment ID','Request ID','Tracking Code','Amount','Transaction Ref','Receipt File ID','Receipt MIME Type','Status','Submitted At','Reviewed At','Reviewed By','Notes'],
    BookingLogs: ['Event ID','Request ID','Event','From Status','To Status','Actor','At','Details']
  },
  STATUS: {
    REQUEST_PENDING: 'REQUEST_PENDING',
    PAYMENT_PENDING: 'PAYMENT_PENDING',
    RECEIPT_REVIEW: 'RECEIPT_REVIEW',
    CONFIRMED: 'CONFIRMED',
    REJECTED: 'REJECTED',
    EXPIRED: 'EXPIRED',
    CANCEL_REQUESTED: 'CANCEL_REQUESTED',
    RESCHEDULE_REQUESTED: 'RESCHEDULE_REQUESTED',
    MANAGER_RESCHEDULE_OFFERED: 'MANAGER_RESCHEDULE_OFFERED',
    CANCELLED: 'CANCELLED'
  },
  REQUEST_TTL_MS: 12 * 60 * 60 * 1000,
  PAYMENT_TTL_MS: 30 * 60 * 1000
});

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const action = String(p.action || 'health').trim();
    if (action === 'health') return out_({ok:true, service:'KaenatChi Booking Core', mode:'staging-rebuild', cmsWrites:false});
    if (action === 'getConfig') return out_(getPublicConfig_());
    if (action === 'getSlots') return out_(getSlots_(p.date, String(p.serviceIds||'').split(',').filter(Boolean)));
    if (action === 'getStatus') return out_(getStatus_(p.trackingCode, p.phone));
    return out_({ok:false,error:'UNKNOWN_ACTION',message:'عملیات شناخته نشد.'});
  } catch (err) {
    console.error(err);
    return out_({ok:false,error:'SERVER_ERROR',message:'خطای داخلی سرور.'});
  }
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents;
    const body = raw ? JSON.parse(raw) : {};
    if (body && body.callback_query) return out_(handleTelegramCallback_(body.callback_query, e && e.parameter));
    const action = String(body.action || '').trim();
    if (action === 'createRequest') return out_(createRequest_(body));
    if (action === 'submitReceipt') return out_(submitReceipt_(body));
    if (action === 'adminDecision') {
      requireAdmin_(body.adminSecret);
      return out_(adminDecision_(body));
    }
    if (action === 'requestCancel') return out_(requestCancel_(body));
    if (action === 'requestReschedule') return out_(requestReschedule_(body));
    if (action === 'managerRescheduleOffer') { requireAdmin_(body.adminSecret); return out_(managerRescheduleOffer_(body)); }
    if (action === 'acceptManagerReschedule') return out_(acceptManagerReschedule_(body));
    return out_({ok:false,error:'UNKNOWN_ACTION',message:'عملیات شناخته نشد.'});
  } catch (err) {
    console.error(err);
    return out_({ok:false,error:err.code || 'SERVER_ERROR',message:err.publicMessage || 'درخواست انجام نشد.'});
  }
}

/** Run manually only in the Apps Script project intended for STAGING. */
function initializeStagingSchema() {
  const ss = staging_();
  Object.keys(CORE.HEADERS).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const expected = CORE.HEADERS[name];
    const current = sh.getLastRow() ? sh.getRange(1,1,1,Math.max(sh.getLastColumn(), expected.length)).getDisplayValues()[0] : [];
    const blank = current.every(v => !String(v || '').trim());
    if (blank) sh.getRange(1,1,1,expected.length).setValues([expected]);
    else {
      const missing = expected.filter(h => current.indexOf(h) < 0);
      if (missing.length) throw new Error('SCHEMA_MISMATCH_' + name + ': missing columns: ' + missing.join(', '));
    }
  });
  return {ok:true, spreadsheet:ss.getName(), tabs:Object.keys(CORE.HEADERS), note:'No CMS tabs or values were changed.'};
}

function getPublicConfig_() {
  // Read the published CMS data API. The booking core never writes to CMS.
  const api=prop_(CORE.CMS_API_URL_PROP);
  if(!api) fail_('CMS_UNAVAILABLE','نشانی API کائنات‌چی در تنظیمات خصوصی Staging پیکربندی نشده است.');
  let response;
  try {
    response=UrlFetchApp.fetch(api+(api.indexOf('?')>=0?'&':'?')+'action=getMiniAppData',{muteHttpExceptions:true,followRedirects:true});
  } catch(err) {
    fail_('CMS_UNAVAILABLE','ارتباط با API کائنات‌چی برقرار نشد.');
  }
  if(response.getResponseCode()<200||response.getResponseCode()>=300) fail_('CMS_UNAVAILABLE','API کائنات‌چی پاسخ معتبر نداد.');
  let payload;
  try { payload=JSON.parse(response.getContentText()); } catch(err) { fail_('CMS_UNAVAILABLE','پاسخ API کائنات‌چی JSON معتبر نیست.'); }
  if(!payload||payload.success!==true||!Array.isArray(payload.services)) fail_('CMS_CONTRACT_MISMATCH','ساختار دادهٔ خدمات CMS با قرارداد Staging هماهنگ نیست.');
  const mapped=payload.services.map(r=>({
    id:String(first_(r,['شناسه','شناسه خدمت','Service ID','ServiceId','ID','Id','id','slug'])||''),
    name:String(first_(r,['نام خدمت','عنوان','نام','Service Name','Name','Title','title'])||''),
    category:String(first_(r,['دسته','دسته‌بندی','Category','Service Category','category'])||''),
    description:String(first_(r,['توضیح کوتاه','Description','Short Description','توضیحات','description'])||''),
    price:num_(first_(r,['قیمت','هزینه','Price','Base Price','Original Price','مبلغ','price'])),
    duration:num_(first_(r,['مدت','مدت زمان','Duration','duration']))||30
  })).filter(s=>s.id&&s.name&&s.price>=0);
  if(!mapped.length) fail_('CMS_SERVICES_EMPTY','API کائنات‌چی هیچ خدمت قابل رزروی برنگرداند.');
  return {ok:true,services:mapped,availableDates:[tomorrowJalali_()],bookingRules:{requestReviewHours:12,paymentMinutes:30,timezone:CORE.TZ}};
}

/** Slot generation follows the approved weekly schedule; CMS closures are overlaid read-only. */
function getSlots_(date, serviceIds) {
  const tomorrow = tomorrowJalali_();
  if (String(date || tomorrow) !== tomorrow) return {ok:true,date:tomorrow,slots:[],message:'فقط برای فردا امکان ثبت درخواست وجود دارد.'};
  expireStaleRequests_();
  const day=tehranTomorrowWeekday_();
  const ids=Array.isArray(serviceIds)?[...new Set(serviceIds.map(String))]:[];
  let schedule=scheduleForDay_(day),duration=30,serviceMode='energy';
  if(ids.length) {
    const catalog=getPublicConfig_().services;
    const selected=ids.map(id=>catalog.find(s=>s.id===id));
    if(selected.some(s=>!s)) return {ok:true,date:tomorrow,slots:[],message:'یکی از خدمات انتخاب‌شده معتبر نیست.'};
    const isTherapy=s=>/درمان|therapy|psychotherap|روان.?درمان|شمع.?درمان/i.test((s.category||'')+' '+(s.name||''));
    const therapy=selected.some(isTherapy),energy=selected.some(s=>!isTherapy(s));
    if(therapy&&energy) return {ok:true,date:tomorrow,slots:[],message:'خدمات درمانی و انرژی در یک نوبت قابل ترکیب نیستند.'};
    serviceMode=therapy?'therapy':'energy';
    duration=selected.reduce((sum,s)=>sum+Math.max(1,num_(s.duration)||30),0);
    if(therapy) schedule=day===4?therapySlots_():[];
  }
  const closures=readClosureSet_();
  const slots=schedule.map(time=>{
    const key=tomorrow+'|'+time;
    const closed=closures.dates.has(tomorrow)||closures.slots.has(key);
    const taken=slotHasConflict_(tomorrow,time,duration,'');
    return {date:tomorrow,time,period:(time<'15:00'?'صبح':'عصر'),status:closed?'BLOCKED':taken?'BOOKED':'AVAILABLE',
      label:closed?'تعطیل':taken?'رزرو شده':time,
      message:closed?'این زمان در این تاریخ قابل رزرو نیست.':taken?'این زمان با نوبت دیگری تداخل دارد؛ زمان دیگری انتخاب کن.':''};
  });
  return {ok:true,date:tomorrow,slots,serviceMode,durationMinutes:duration};
}

function createRequest_(b) {
  return withLock_(() => {
    const firstName = String(b.firstName || '').trim();
    const lastName = String(b.lastName || '').trim();
    const phone = String(b.phone || '');
    if (!/^[\u0621-\u063A\u0641-\u064A\u067E\u0686\u0698\u06A9\u06AF\u06CC\u200c\s]+$/.test(firstName) || !/^[\u0621-\u063A\u0641-\u064A\u067E\u0686\u0698\u06A9\u06AF\u06CC\u200c\s]+$/.test(lastName)) fail_('INVALID_NAME','نام و نام خانوادگی را فقط با حروف فارسی وارد کن.');
    if (!/^09[0-9]{9}$/.test(phone)) fail_('INVALID_PHONE','شماره همراه باید دقیقاً ۱۱ رقم انگلیسی و با 09 شروع شود.');
    const date = String(b.date || '');
    const time = normalizeTime_(b.time);
    if (date !== tomorrowJalali_()) fail_('DATE_NOT_ALLOWED','فقط برای فردا می‌توان درخواست ثبت کرد.');
    const ids = Array.isArray(b.serviceIds) ? [...new Set(b.serviceIds.map(String))] : [];
    const slot = getSlots_(date, ids).slots.find(s => s.time === time);
    if (!slot || slot.status !== 'AVAILABLE') fail_('SLOT_UNAVAILABLE','این زمان دیگر در دسترس نیست؛ زمان دیگری انتخاب کن.');
    if (!ids.length) fail_('SERVICE_REQUIRED','حداقل یک خدمت انتخاب کن.');
    const catalog = getPublicConfig_().services;
    const chosen = ids.map(id => catalog.find(s => s.id === id));
    if (chosen.some(s => !s)) fail_('INVALID_SERVICE','یکی از خدمات انتخاب‌شده معتبر نیست.');
    const subtotal = chosen.reduce((sum,s) => sum + s.price,0);
    const discount = validateDiscountReadOnly_(String(b.discountCode || ''), subtotal);
    const now = new Date();
    const requestId = 'REQ-' + Utilities.getUuid().replace(/-/g,'').slice(0,20).toUpperCase();
    const tracking = Utilities.getUuid().replace(/-/g,'').slice(0,24).toUpperCase();
    const expires = new Date(now.getTime()+CORE.REQUEST_TTL_MS);
    const row = {
      'Request ID':requestId,'Tracking Code':tracking,'Appointment Code':'','Status':CORE.STATUS.REQUEST_PENDING,
      'First Name':firstName,'Last Name':lastName,'Phone':phone,'Appointment Date':date,'Appointment Time':time,
      'Service IDs':ids.join(','),'Service Names':chosen.map(s=>s.name).join('، '),'Subtotal':subtotal,
      'Discount Code':discount.code,'Discount Amount':discount.amount,'Total':Math.max(0,subtotal-discount.amount),
      'Created At':now,'Request Expires At':expires,'Payment Expires At':'','Receipt File ID':'','Receipt MIME Type':'',
      'Transaction Ref':'','Decision At':'','Decision By':'','Reschedule From':'','Updated At':now
    };
    appendObject_(tab_(CORE.TABS.BOOKINGS),row);
    log_(requestId,'REQUEST_CREATED','',CORE.STATUS.REQUEST_PENDING,'customer',{date,time,services:ids,total:row.Total});
    notifyAdmin_(requestId,'درخواست نوبت جدید',row);
    return {ok:true,requestId,trackingCode:tracking,status:CORE.STATUS.REQUEST_PENDING,expiresAt:expires.toISOString(),total:row.Total,discountAmount:discount.amount,message:'درخواست ثبت شد؛ نوبت هنوز قطعی نیست و تا پذیرش، پرداختی لازم نیست.'};
  });
}

function submitReceipt_(b) {
  return withLock_(() => {
    const rowRef = findBooking_(String(b.trackingCode||''),String(b.phone||''));
    if (!rowRef) fail_('NOT_FOUND','درخواست پیدا نشد؛ کد پیگیری و شماره همراه را بررسی کن.');
    const row = rowRef.obj;
    if (row.Status !== CORE.STATUS.PAYMENT_PENDING) fail_('INVALID_STATE','این درخواست در مرحله دریافت فیش نیست.');
    if (new Date(row['Payment Expires At']).getTime() < Date.now()) {
      transition_(rowRef,CORE.STATUS.EXPIRED,'system','PAYMENT_WINDOW_EXPIRED');
      fail_('PAYMENT_EXPIRED','مهلت ۳۰ دقیقه‌ای پرداخت تمام شده است؛ اگر زمان آزاد باشد، درخواست تازه ثبت کن.');
    }
    const mime = String(b.mimeType||'');
    const base64 = String(b.receiptBase64||'');
    const tx = String(b.transactionRef||'').trim();
    if (!/^image\/(jpeg|png|webp)$/.test(mime) || !base64 || base64.length > 7_000_000) fail_('INVALID_RECEIPT','تصویر فیش معتبر لازم است.');
    if (!tx) fail_('TRANSACTION_REF_REQUIRED','شماره پیگیری تراکنش را وارد کن.');
    const bytes = Utilities.base64Decode(base64);
    const blob = Utilities.newBlob(bytes,mime,'receipt-'+row['Request ID']);
    const file = DriveApp.createFile(blob);
    file.setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.VIEW);
    row['Receipt File ID'] = file.getId(); row['Receipt MIME Type'] = mime; row['Transaction Ref'] = tx; row.Status = CORE.STATUS.RECEIPT_REVIEW; row['Updated At'] = new Date();
    writeObject_(rowRef.sheet,rowRef.row,row);
    appendObject_(tab_(CORE.TABS.PAYMENTS),{'Payment ID':'PAY-'+Utilities.getUuid(),'Request ID':row['Request ID'],'Tracking Code':row['Tracking Code'],'Amount':row.Total,'Transaction Ref':tx,'Receipt File ID':file.getId(),'Receipt MIME Type':mime,'Status':'RECEIPT_REVIEW','Submitted At':new Date(),'Reviewed At':'','Reviewed By':'','Notes':''});
    log_(row['Request ID'],'RECEIPT_SUBMITTED',CORE.STATUS.PAYMENT_PENDING,CORE.STATUS.RECEIPT_REVIEW,'customer',{transactionRef:tx});
    notifyReceipt_(row,file.getBlob());
    return {ok:true,status:CORE.STATUS.RECEIPT_REVIEW,message:'فیش دریافت شد؛ نوبت تا بررسی واقعی پرداخت توسط مایا نگه داشته می‌شود.'};
  });
}

function adminDecision_(b) {
  return withLock_(() => {
    const id = String(b.requestId||'');
    const ref = findByRequestId_(id);
    if (!ref) fail_('NOT_FOUND','درخواست پیدا نشد.');
    const row = ref.obj;
    const decision = String(b.decision||'');
    const actor = String(b.actor||'maya');
    if (decision === 'accept') {
      if (row.Status !== CORE.STATUS.REQUEST_PENDING) fail_('INVALID_STATE','این درخواست دیگر در انتظار پذیرش اولیه نیست.');
      if (new Date(row['Request Expires At']).getTime() < Date.now()) {
        transition_(ref,CORE.STATUS.EXPIRED,'system','REQUEST_WINDOW_EXPIRED');
        fail_('REQUEST_EXPIRED','مهلت بررسی درخواست تمام شده است.');
      }
      row['Payment Expires At'] = new Date(Date.now()+CORE.PAYMENT_TTL_MS);
      transition_(ref,CORE.STATUS.PAYMENT_PENDING,actor,'ADMIN_ACCEPTED');
      row['Updated At'] = new Date(); writeObject_(ref.sheet,ref.row,row);
      notifyCustomerPaymentWindow_(row);
      return {ok:true,status:row.Status,paymentDeadline:row['Payment Expires At'].toISOString()};
    }
    if (decision === 'reject') {
      if (![CORE.STATUS.REQUEST_PENDING,CORE.STATUS.RECEIPT_REVIEW].includes(row.Status)) fail_('INVALID_STATE','رد در این مرحله مجاز نیست.');
      transition_(ref,CORE.STATUS.REJECTED,actor,'ADMIN_REJECTED');
      row['Decision At']=new Date();row['Decision By']=actor;row['Updated At']=new Date();writeObject_(ref.sheet,ref.row,row);
      return {ok:true,status:row.Status};
    }
    if (decision === 'approvePayment') {
      if (row.Status !== CORE.STATUS.RECEIPT_REVIEW) fail_('INVALID_STATE','این فیش در انتظار بررسی نیست.');
      // Never confirm a discounted booking until VIP token consumption is
      // implemented atomically with payment approval. Otherwise a token could
      // remain reusable after the booking is confirmed.
      if (String(row['Discount Code']||'').trim()) {
        fail_('DISCOUNT_FINALIZATION_UNAVAILABLE','تأیید نهایی این پرداخت تا تکمیل مصرف امن توکن VIP متوقف است؛ نوبت همچنان برای بررسی مدیر نگه داشته می‌شود.');
      }
      row['Appointment Code'] = 'KC-' + Utilities.getUuid().replace(/-/g,'').slice(0,10).toUpperCase();
      row['Decision At']=new Date();row['Decision By']=actor;row['Updated At']=new Date();
      transition_(ref,CORE.STATUS.CONFIRMED,actor,'BANK_DEPOSIT_VERIFIED');
      writeObject_(ref.sheet,ref.row,row);
      updatePaymentStatus_(id,'APPROVED',actor);
      return {ok:true,status:row.Status,appointmentCode:row['Appointment Code']};
    }
    if (decision === 'rejectPayment') {
      if (row.Status !== CORE.STATUS.RECEIPT_REVIEW) fail_('INVALID_STATE','این فیش در انتظار بررسی نیست.');
      transition_(ref,CORE.STATUS.REJECTED,actor,'PAYMENT_REJECTED');
      row['Decision At']=new Date();row['Decision By']=actor;row['Updated At']=new Date();writeObject_(ref.sheet,ref.row,row);
      updatePaymentStatus_(id,'REJECTED',actor);
      return {ok:true,status:row.Status};
    }
    if (decision === 'approveReschedule') {
      if (row.Status !== CORE.STATUS.RESCHEDULE_REQUESTED) fail_('INVALID_STATE','درخواست تغییر زمان در صف بررسی نیست.');
      const d=String(row['Requested Reschedule Date']||'');const t=normalizeTime_(row['Requested Reschedule Time']);
      if(!isSlotAvailableFor_(d,t,String(row['Service IDs']||'').split(',').filter(Boolean),id)) fail_('SLOT_UNAVAILABLE','زمان پیشنهادی دیگر در دسترس نیست؛ نوبت قبلی حفظ شده است.');
      row['Appointment Date']=d;row['Appointment Time']=t;row['Appointment Code']='KC-'+Utilities.getUuid().replace(/-/g,'').slice(0,10).toUpperCase();row['Requested Reschedule Date']='';row['Requested Reschedule Time']='';row.Status=CORE.STATUS.CONFIRMED;row['Updated At']=new Date();writeObject_(ref.sheet,ref.row,row);
      log_(id,'RESCHEDULE_APPROVED',CORE.STATUS.RESCHEDULE_REQUESTED,CORE.STATUS.CONFIRMED,actor,{newDate:d,newTime:t,oldSlotReleased:true});
      return {ok:true,status:row.Status,date:d,time:t,appointmentCode:row['Appointment Code']};
    }
    if (decision === 'rejectReschedule') {
      if (row.Status !== CORE.STATUS.RESCHEDULE_REQUESTED) fail_('INVALID_STATE','درخواست تغییر زمان در صف بررسی نیست.');
      row['Requested Reschedule Date']='';row['Requested Reschedule Time']='';row.Status=CORE.STATUS.CONFIRMED;row['Updated At']=new Date();writeObject_(ref.sheet,ref.row,row);
      log_(id,'RESCHEDULE_REJECTED',CORE.STATUS.RESCHEDULE_REQUESTED,CORE.STATUS.CONFIRMED,actor,{oldSlotRetained:true});
      return {ok:true,status:row.Status,message:'درخواست تغییر زمان رد شد؛ نوبت قبلی حفظ شد.'};
    }
    if (decision === 'approveCancel') {
      if (row.Status !== CORE.STATUS.CANCEL_REQUESTED) fail_('INVALID_STATE','درخواست لغو در صف بررسی نیست.');
      transition_(ref,CORE.STATUS.CANCELLED,actor,'CANCELLATION_APPROVED');
      row['Decision At']=new Date();row['Decision By']=actor;row['Updated At']=new Date();writeObject_(ref.sheet,ref.row,row);
      return {ok:true,status:row.Status,refundRequiresManualProcessing:true,message:'لغو ثبت شد؛ بازپرداخت کارت‌به‌کارت باید دستی انجام شود.'};
    }
    if (decision === 'rejectCancel') {
      if (row.Status !== CORE.STATUS.CANCEL_REQUESTED) fail_('INVALID_STATE','درخواست لغو در صف بررسی نیست.');
      row.Status=CORE.STATUS.CONFIRMED;row['Decision At']=new Date();row['Decision By']=actor;row['Updated At']=new Date();writeObject_(ref.sheet,ref.row,row);
      log_(id,'CANCELLATION_REJECTED',CORE.STATUS.CANCEL_REQUESTED,CORE.STATUS.CONFIRMED,actor,{});
      return {ok:true,status:row.Status,message:'درخواست لغو رد شد؛ نوبت حفظ شد.'};
    }
    if (decision === 'holdForReview') {
      if (row.Status !== CORE.STATUS.RECEIPT_REVIEW) fail_('INVALID_STATE','فیشی برای نگه‌داشتن در صف بررسی وجود ندارد.');
      log_(id,'PAYMENT_HELD_FOR_REVIEW',row.Status,row.Status,actor,{});
      return {ok:true,status:row.Status,autoRelease:false};
    }
    fail_('INVALID_DECISION','تصمیم مدیریتی نامعتبر است.');
  });
}

function requestCancel_(b) {
  return withLock_(() => {
    const ref=findBooking_(String(b.trackingCode||''),String(b.phone||''));
    if(!ref) fail_('NOT_FOUND','درخواست پیدا نشد.');
    if(ref.obj.Status!==CORE.STATUS.CONFIRMED) fail_('INVALID_STATE','درخواست لغو فقط برای نوبت قطعی قابل ثبت است.');
    const appointmentMs = parseJalaliDateTime_(ref.obj['Appointment Date'],ref.obj['Appointment Time']);
    if (appointmentMs-Date.now() < 8*60*60*1000) fail_('CANCELLATION_WINDOW','لغو عادی باید دست‌کم ۸ ساعت پیش از شروع نوبت درخواست شود؛ شرایط اضطراری جداگانه بررسی می‌شود.');
    transition_(ref,CORE.STATUS.CANCEL_REQUESTED,'customer','CANCEL_REQUESTED');
    return {ok:true,status:CORE.STATUS.CANCEL_REQUESTED,message:'درخواست لغو/بازپرداخت برای بررسی مایا ثبت شد؛ خودکار لغو یا بازپرداخت نمی‌شود.'};
  });
}

function requestReschedule_(b) {
  return withLock_(() => {
    const ref=findBooking_(String(b.trackingCode||''),String(b.phone||''));
    if(!ref) fail_('NOT_FOUND','درخواست پیدا نشد.');
    if(ref.obj.Status!==CORE.STATUS.CONFIRMED) fail_('INVALID_STATE','تغییر زمان فقط برای نوبت قطعی ممکن است.');
    const targetDate=String(b.date||'');const targetTime=normalizeTime_(b.time);
    if(targetDate!==tomorrowJalali_()) fail_('DATE_NOT_ALLOWED','فقط زمان‌های فردا قابل انتخاب‌اند.');
    const slot=getSlots_(targetDate,String(ref.obj['Service IDs']||'').split(',').filter(Boolean)).slots.find(s=>s.time===targetTime);
    if(!slot||slot.status!=='AVAILABLE') fail_('SLOT_UNAVAILABLE','زمان جدید در دسترس نیست.');
    // Keep the confirmed appointment intact until Maya approves the customer's request.
    ref.obj['Reschedule From']=ref.obj['Appointment Date']+' '+ref.obj['Appointment Time'];
    ref.obj['Requested Reschedule Date']=targetDate;
    ref.obj['Requested Reschedule Time']=targetTime;
    ref.obj.Status=CORE.STATUS.RESCHEDULE_REQUESTED;
    ref.obj['Updated At']=new Date();
    writeObject_(ref.sheet,ref.row,ref.obj);
    log_(ref.obj['Request ID'],'RESCHEDULE_REQUESTED',CORE.STATUS.CONFIRMED,CORE.STATUS.RESCHEDULE_REQUESTED,'customer',{targetDate,targetTime,oldSlotRetained:true});
    notifyAdmin_(ref.obj['Request ID'],'درخواست تغییر زمان',ref.obj);
    return {ok:true,status:CORE.STATUS.RESCHEDULE_REQUESTED,message:'درخواست تغییر زمان بدون جریمه برای بررسی مایا ثبت شد؛ پرداخت مجدد لازم نیست.'};
  });
}

function managerRescheduleOffer_(b) {
  return withLock_(()=>{
    const ref=findBooking_(String(b.trackingCode||''),String(b.phone||''));
    if(!ref) fail_('NOT_FOUND','نوبت پیدا نشد.');
    if(ref.obj.Status!==CORE.STATUS.CONFIRMED) fail_('INVALID_STATE','فقط نوبت قطعی را می‌توان برای تغییر زمان پیشنهاد داد.');
    ref.obj.Status=CORE.STATUS.MANAGER_RESCHEDULE_OFFERED;ref.obj['Updated At']=new Date();writeObject_(ref.sheet,ref.row,ref.obj);
    log_(ref.obj['Request ID'],'MANAGER_RESCHEDULE_OFFERED',CORE.STATUS.CONFIRMED,CORE.STATUS.MANAGER_RESCHEDULE_OFFERED,'admin',{oldSlotRetained:true});
    return {ok:true,status:ref.obj.Status,message:'پیشنهاد تغییر زمان ثبت شد؛ نوبت قبلی تا انتخاب مشتری نگه داشته می‌شود.'};
  });
}
function acceptManagerReschedule_(b) {
  return withLock_(()=>{
    const ref=findBooking_(String(b.trackingCode||''),String(b.phone||''));
    if(!ref) fail_('NOT_FOUND','نوبت پیدا نشد.');
    if(ref.obj.Status!==CORE.STATUS.MANAGER_RESCHEDULE_OFFERED) fail_('INVALID_STATE','پیشنهاد تغییر زمان فعالی وجود ندارد.');
    const d=String(b.date||''),t=normalizeTime_(b.time);
    if(d!==tomorrowJalali_()) fail_('DATE_NOT_ALLOWED','فقط زمان‌های فردا قابل انتخاب‌اند.');
    const slot=getSlots_(d,String(ref.obj['Service IDs']||'').split(',').filter(Boolean)).slots.find(s=>s.time===t);
    if(!slot||slot.status!=='AVAILABLE') fail_('SLOT_UNAVAILABLE','زمان انتخابی در دسترس نیست؛ نوبت قبلی حفظ شده است.');
    const old=ref.obj['Appointment Date']+' '+ref.obj['Appointment Time'];
    ref.obj['Appointment Date']=d;ref.obj['Appointment Time']=t;ref.obj['Appointment Code']='KC-'+Utilities.getUuid().replace(/-/g,'').slice(0,10).toUpperCase();
    ref.obj.Status=CORE.STATUS.CONFIRMED;ref.obj['Updated At']=new Date();writeObject_(ref.sheet,ref.row,ref.obj);
    log_(ref.obj['Request ID'],'MANAGER_RESCHEDULE_ACCEPTED',CORE.STATUS.MANAGER_RESCHEDULE_OFFERED,CORE.STATUS.CONFIRMED,'customer',{old,newDate:d,newTime:t,oldSlotReleased:true});
    notifyAdmin_(ref.obj['Request ID'],'تغییر زمان پیشنهادی تأیید شد',ref.obj);
    return {ok:true,status:ref.obj.Status,date:d,time:t,appointmentCode:ref.obj['Appointment Code'],message:'زمان جدید ثبت شد؛ پرداخت مجدد لازم نیست.'};
  });
}
function getStatus_(trackingCode,phone) {
  const ref=findBooking_(String(trackingCode||''),String(phone||''));
  if(!ref) return {ok:true,found:false,message:'درخواستی با این کد پیگیری و شماره همراه پیدا نشد.'};
  const r=ref.obj;
  return {ok:true,found:true,requestId:r['Request ID'],trackingCode:r['Tracking Code'],status:r.Status,date:r['Appointment Date'],time:r['Appointment Time'],total:r.Total,paymentDeadline:r['Payment Expires At']?new Date(r['Payment Expires At']).toISOString():null,appointmentCode:r.Status===CORE.STATUS.CONFIRMED?r['Appointment Code']:'',canResumeReceipt:r.Status===CORE.STATUS.PAYMENT_PENDING};
}

function validateDiscountReadOnly_(code,subtotal) {
  if(!code) return {code:'',amount:0};
  // Fail closed until the request carries server-verified Telegram initData
  // and token ownership is bound to that verified identity. A client-supplied
  // telegramId is not proof of ownership and must never authorize a VIP discount.
  fail_('DISCOUNT_IDENTITY_UNVERIFIED','اعمال کد تخفیف موقتاً غیرفعال است تا هویت تلگرام و مالکیت توکن به‌صورت امن تأیید شود.');
  const clean=String(code).trim().toUpperCase();
  const vipId=prop_(CORE.VIP_ID_PROP);
  if(!vipId) fail_('DISCOUNT_UNAVAILABLE','اتصال VIP در تنظیمات خصوصی Staging پیکربندی نشده است.');
  const vip=SpreadsheetApp.openById(vipId);
  const ts=vip.getSheetByName('توکن ها');
  const cs=vip.getSheetByName('مشتریان');
  if(!ts||!cs) fail_('DISCOUNT_UNAVAILABLE','امکان بررسی کد تخفیف در حال حاضر وجود ندارد.');
  const tokens=ts.getLastRow()>1?ts.getRange(2,1,ts.getLastRow()-1,Math.max(10,ts.getLastColumn())).getValues():[];
  const customers=cs.getLastRow()>1?cs.getRange(2,1,cs.getLastRow()-1,8).getValues():[];
  const token=tokens.find(r=>String(r[0]||'').trim().toUpperCase()===clean);
  if(!token) fail_('INVALID_DISCOUNT','کد تخفیف معتبر نیست.');
  const customer=customers.find(r=>String(r[0]||'').trim()===String(token[1]||'').trim());
  const status=String(token[5]||'').trim();
  const expiry=Number(token[9]||0);
  if(status==='مصرف‌شده') fail_('DISCOUNT_USED','کد تخفیف قبلاً استفاده شده است.');
  if(status!=='فعال') fail_('DISCOUNT_INACTIVE','کد تخفیف فعال نیست.');
  if(expiry&&expiry<=Date.now()) fail_('DISCOUNT_EXPIRED','کد تخفیف منقضی شده است.');
  if(!customer||String(customer[7]||'').trim()!=='فعال') fail_('DISCOUNT_MEMBER_INACTIVE','عضویت مربوط به این کد تخفیف فعال نیست.');
  const percent=Math.max(0,Math.min(100,num_(token[2])));
  return {code:clean,percent,amount:Math.round(subtotal*percent/100)};
}

function therapySlots_() {
  const out=[];
  ['11','12','13','16','17','18'].forEach(h=>{out.push(h+':00');out.push(h+':30');});
  out.push('13:30');
  return out.filter((t,i,a)=>a.indexOf(t)===i).filter(t=>t>='11:00'&&t<='13:30'||t>='16:00'&&t<='18:30').sort();
}
function runBookingCoreSelfTests() {
  const checks=[];
  const test=(name,ok,detail)=>checks.push({name,ok:!!ok,detail:detail||''});
  test('Saturday energy slots',JSON.stringify(scheduleForDay_(6))===JSON.stringify(['11:00','12:00','13:00','16:00','17:00','18:00']));
  test('Sunday energy slots',JSON.stringify(scheduleForDay_(0))===JSON.stringify(['11:30','12:30','13:30','16:30','17:30','18:30']));
  test('Friday closed',scheduleForDay_(5).length===0);
  test('Thursday therapy slots',therapySlots_().includes('13:30')&&therapySlots_().includes('18:30')&&!therapySlots_().includes('14:00'));
  test('Strict ASCII phone accepted',/^09[0-9]{9}$/.test('09371234567'));
  test('Persian digits rejected in phone',!/^09[0-9]{9}$/.test('۰۹۳۷۱۲۳۴۵۶۷'));
  test('Jalali conversion known date',JSON.stringify(jalaliToGregorian_(1405,7,16))===JSON.stringify({gy:2026,gm:10,gd:8}));
  test('12-hour initial review TTL',CORE.REQUEST_TTL_MS===43200000);
  test('30-minute payment TTL',CORE.PAYMENT_TTL_MS===1800000);
  return {ok:checks.every(x=>x.ok),executed:true,noSpreadsheetWrites:true,noTelegramCalls:true,checks};
}
function scheduleForDay_(day) {
  // JS weekday: 0 Sun, 1 Mon, ... 6 Sat
  if(day===5) return [];
  if(day===4) return ['11:00','12:00','13:00','16:00','17:00','18:00'];
  if([6,1,3].includes(day)) return ['11:00','12:00','13:00','16:00','17:00','18:00'];
  if([0,2].includes(day)) return ['11:30','12:30','13:30','16:30','17:30','18:30'];
  return [];
}
function readClosureSet_() {
  // Booking closures are operational data in the isolated booking spreadsheet.
  // This function is read-only and never opens or writes to the CMS spreadsheet.
  const dates=new Set(),slots=new Set();
  const ss=staging_(),sh=ss.getSheetByName(CORE.TABS.CLOSURES);
  if(!sh) fail_('CLOSURES_TAB_MISSING','شیت Closures در Staging موجود نیست؛ تا اصلاح ساختار، رزرو متوقف شد.');
  const rows=readObjects_(ss,[CORE.TABS.CLOSURES]);
  const target=tomorrowJalali_();
  rows.forEach(r=>{
    if(!active_(first_(r,['active','Active','فعال','Status']))) return;
    const rawStart=first_(r,['start_datetime','Start Datetime','start','Start']);
    const rawEnd=first_(r,['end_datetime','End Datetime','end','End']);
    const startDate=closureDate_(rawStart),endDate=closureDate_(rawEnd);
    if(!startDate||!endDate) fail_('CLOSURE_DATE_INVALID','یک بازهٔ مسدود در Staging تاریخ معتبر ندارد؛ برای جلوگیری از رزرو ناامن، بررسی متوقف شد.');
    if(target<startDate||target>endDate) return;
    const startTime=closureTime_(rawStart),endTime=closureTime_(rawEnd);
    if(startDate!==endDate||!startTime||!endTime||startTime>=endTime) {
      dates.add(target);
      return;
    }
    let cursor=minutes_(startTime),finish=minutes_(endTime);
    while(cursor<finish) {
      slots.add(target+'|'+('0'+Math.floor(cursor/60)).slice(-2)+':'+('0'+(cursor%60)).slice(-2));
      cursor+=30;
    }
  });
  return {dates,slots};
}
function closureDate_(value) {
  if(value instanceof Date && Number.isFinite(value.getTime())) {
    const parts=new Intl.DateTimeFormat('en-u-ca-persian',{timeZone:CORE.TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value);
    const p={};parts.forEach(x=>p[x.type]=x.value);return p.year+'/'+p.month+'/'+p.day;
  }
  const s=String(value||'').trim();
  const match=s.match(/\d{4}[\/-]\d{1,2}[\/-]\d{1,2}/);
  const normalized=normalizeDate_(match?match[0]:'');
  if(/^\d{4}\/\d{2}\/\d{2}$/.test(normalized)) return normalized;
  const d=new Date(s);
  if(!Number.isFinite(d.getTime())) return '';
  const parts=new Intl.DateTimeFormat('en-u-ca-persian',{timeZone:CORE.TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
  const p={};parts.forEach(x=>p[x.type]=x.value);return p.year+'/'+p.month+'/'+p.day;
}
function closureTime_(value) {
  if(value instanceof Date && Number.isFinite(value.getTime())) {
    return new Intl.DateTimeFormat('en-GB',{timeZone:CORE.TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(value);
  }
  const s=String(value||'').trim();
  const m=s.match(/(?:T|\s)(\d{1,2}:\d{2})(?::\d{2})?/);
  return normalizeTime_(m?m[1]:s);
}
function expireStaleRequests_() {
  const now=Date.now();
  objectsWithRows_(tab_(CORE.TABS.BOOKINGS)).forEach(ref=>{
    const status=String(ref.obj.Status||'');
    const requestExpiry=new Date(ref.obj['Request Expires At']).getTime();
    const paymentExpiry=new Date(ref.obj['Payment Expires At']).getTime();
    if(status===CORE.STATUS.REQUEST_PENDING && Number.isFinite(requestExpiry) && requestExpiry>0 && requestExpiry<=now) transition_(ref,CORE.STATUS.EXPIRED,'system','REQUEST_WINDOW_EXPIRED');
    else if(status===CORE.STATUS.PAYMENT_PENDING && Number.isFinite(paymentExpiry) && paymentExpiry>0 && paymentExpiry<=now) transition_(ref,CORE.STATUS.EXPIRED,'system','PAYMENT_WINDOW_EXPIRED');
  });
}
function isSlotAvailableFor_(date,time,serviceIds,excludeRequestId) {
  if(date!==tomorrowJalali_()) return false;
  const day=tehranTomorrowWeekday_(),ids=Array.isArray(serviceIds)?serviceIds:[];
  const catalog=ids.length?getPublicConfig_().services:[];
  const selected=ids.map(id=>catalog.find(s=>s.id===id)).filter(Boolean);
  const therapy=selected.some(s=>/درمان|therapy|psychotherap|روان.?درمان|شمع.?درمان/i.test(s.category+' '+s.name));
  const energy=selected.some(s=>!/درمان|therapy|psychotherap|روان.?درمان|شمع.?درمان/i.test(s.category+' '+s.name));
  if(therapy&&energy) return false;
  if(therapy ? day!==4 || !therapySlots_().includes(time) : !scheduleForDay_(day).includes(time)) return false;
  const closures=readClosureSet_();
  if(closures.dates.has(date)||closures.slots.has(date+'|'+time)) return false;
  expireStaleRequests_();
  const duration=selected.length?selected.reduce((sum,s)=>sum+Math.max(1,num_(s.duration)||30),0):30;
  return !slotHasConflict_(date,time,duration,excludeRequestId);
}
function slotHasConflict_(date,time,duration,excludeRequestId) {
  const start=minutes_(time);
  if(start<0)return true;
  const end=start+Math.max(1,Number(duration)||30);
  const active=[CORE.STATUS.REQUEST_PENDING,CORE.STATUS.PAYMENT_PENDING,CORE.STATUS.RECEIPT_REVIEW,CORE.STATUS.CONFIRMED,CORE.STATUS.CANCEL_REQUESTED,CORE.STATUS.RESCHEDULE_REQUESTED,CORE.STATUS.MANAGER_RESCHEDULE_OFFERED];
  const rows=objectsWithRows_(tab_(CORE.TABS.BOOKINGS)).filter(x=>active.includes(String(x.obj.Status||''))&&String(x.obj['Request ID']||'')!==String(excludeRequestId||''));
  if(!rows.length)return false;
  const catalog=getPublicConfig_().services;
  const durationFor=row=>{
    const ids=String(row['Service IDs']||'').split(',').filter(Boolean);
    const services=ids.map(id=>catalog.find(s=>s.id===id)).filter(Boolean);
    return services.length?services.reduce((sum,s)=>sum+Math.max(1,num_(s.duration)||30),0):30;
  };
  return rows.some(x=>{
    const candidates=[];
    if(normalizeDate_(x.obj['Appointment Date'])===date)candidates.push(x.obj['Appointment Time']);
    if(String(x.obj.Status)===CORE.STATUS.RESCHEDULE_REQUESTED&&normalizeDate_(x.obj['Requested Reschedule Date'])===date)candidates.push(x.obj['Requested Reschedule Time']);
    return candidates.some(existingTime=>{
      const existingStart=minutes_(existingTime);
      return existingStart>=0&&start<existingStart+durationFor(x.obj)&&existingStart<end;
    });
  });
}
function minutes_(value) {
  const t=normalizeTime_(value).match(/^(\\d{2}):(\\d{2})$/);
  return t?Number(t[1])*60+Number(t[2]):-1;
}
function activeSlotSet_() {
  const set=new Set();
  readObjects_(staging_(),[CORE.TABS.BOOKINGS]).forEach(r=>{
    if([CORE.STATUS.REQUEST_PENDING,CORE.STATUS.PAYMENT_PENDING,CORE.STATUS.RECEIPT_REVIEW,CORE.STATUS.CONFIRMED,CORE.STATUS.CANCEL_REQUESTED,CORE.STATUS.RESCHEDULE_REQUESTED,CORE.STATUS.MANAGER_RESCHEDULE_OFFERED].includes(String(r.Status||''))) set.add(normalizeDate_(r['Appointment Date'])+'|'+normalizeTime_(r['Appointment Time']));
    if(String(r.Status||'')===CORE.STATUS.RESCHEDULE_REQUESTED && r['Requested Reschedule Date'] && r['Requested Reschedule Time']) set.add(normalizeDate_(r['Requested Reschedule Date'])+'|'+normalizeTime_(r['Requested Reschedule Time']));
  });
  return set;
}
function transition_(ref,to,actor,event) {
  const from=String(ref.obj.Status||'');ref.obj.Status=to;ref.obj['Updated At']=new Date();writeObject_(ref.sheet,ref.row,ref.obj);
  log_(ref.obj['Request ID'],event,from,to,actor,{});
}
function log_(id,event,from,to,actor,details) {
  appendObject_(tab_(CORE.TABS.LOGS),{'Event ID':Utilities.getUuid(),'Request ID':id,'Event':event,'From Status':from,'To Status':to,'Actor':actor,'At':new Date(),'Details':JSON.stringify(details||{})});
}
function updatePaymentStatus_(id,status,actor) {
  const sh=tab_(CORE.TABS.PAYMENTS);const rows=objectsWithRows_(sh);
  rows.filter(x=>String(x.obj['Request ID'])===id).forEach(x=>{x.obj.Status=status;x.obj['Reviewed At']=new Date();x.obj['Reviewed By']=actor;writeObject_(sh,x.row,x.obj);});
}
function notifyAdmin_(id,title,row) {
  const token=prop_(CORE.BOT_TOKEN_PROP),chat=prop_(CORE.ADMIN_CHAT_PROP);if(!token||!chat)return;
  const text=title+'\nالاسم: '+row['First Name']+' '+row['Last Name']+'\nخدمت: '+row['Service Names']+'\nزمان: '+row['Appointment Date']+' '+row['Appointment Time']+'\nمبلغ: '+row.Total+'\nکد پیگیری: '+row['Tracking Code']+'\nشناسه درخواست: '+id;
  let buttons;
  if(row.Status===CORE.STATUS.RESCHEDULE_REQUESTED) buttons=[[{text:'تأیید تغییر زمان',callback_data:'approveReschedule:'+id},{text:'رد تغییر زمان',callback_data:'rejectReschedule:'+id}]];
  else if(row.Status===CORE.STATUS.CANCEL_REQUESTED) buttons=[[{text:'پذیرش لغو',callback_data:'approveCancel:'+id},{text:'رد لغو',callback_data:'rejectCancel:'+id}]];
  else buttons=[[{text:'پذیرش درخواست',callback_data:'accept:'+id},{text:'رد درخواست',callback_data:'reject:'+id}]];
  telegram_('sendMessage',{chat_id:chat,text,reply_markup:{inline_keyboard:buttons}});
}
function notifyReceipt_(row,blob) {
  const token=prop_(CORE.BOT_TOKEN_PROP),chat=prop_(CORE.ADMIN_CHAT_PROP);if(!token||!chat)return;
  const caption='فیش پرداخت — '+row['First Name']+' '+row['Last Name']+'\nمبلغ: '+row.Total+'\nشماره پیگیری تراکنش: '+row['Transaction Ref']+'\nکد پیگیری درخواست: '+row['Tracking Code']+'\nشناسه: '+row['Request ID'];
  telegramPhoto_(token,chat,blob,caption,row['Request ID']);
}
function notifyCustomerPaymentWindow_(row) {
  // Customer delivery channel is not assumed. Status polling enables reliable resume after reopening.
  log_(row['Request ID'],'PAYMENT_WINDOW_STARTED','',CORE.STATUS.PAYMENT_PENDING,'system',{deadline:row['Payment Expires At']});
}
function telegram_(method,payload) {
  const token=prop_(CORE.BOT_TOKEN_PROP);if(!token)return;
  UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'post',contentType:'application/json',payload:JSON.stringify(payload),muteHttpExceptions:true});
}
function telegramPhoto_(token,chat,blob,caption,id) {
  const payload={chat_id:chat,photo:blob,caption,reply_markup:JSON.stringify({inline_keyboard:[[{text:'تأیید پس از بررسی بانکی',callback_data:'approvePayment:'+id},{text:'نگه‌دار برای بررسی',callback_data:'holdForReview:'+id}],[{text:'رد فیش',callback_data:'rejectPayment:'+id}]]})};
  UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/sendPhoto',{method:'post',payload,muteHttpExceptions:true});
}
function handleTelegramCallback_(q, params) {
  const supplied=String((params||{}).telegram_webhook||'');
  const expected=prop_(CORE.WEBHOOK_SECRET_PROP);
  if(!expected || supplied!==expected) return {ok:false,error:'UNAUTHORIZED',message:'Telegram callback secret mismatch.'};
  const parts=String(q.data||'').split(':');
  const decision=parts[0], requestId=parts.slice(1).join(':');
  const allowed=['accept','reject','approvePayment','rejectPayment','holdForReview','approveReschedule','rejectReschedule','approveCancel','rejectCancel'];
  if(!allowed.includes(decision)||!requestId) return {ok:false,error:'INVALID_CALLBACK'};
  try {
    const result=adminDecision_({requestId,decision,actor:'telegram-admin',adminSecret:prop_(CORE.ADMIN_SECRET_PROP)});
    telegram_('answerCallbackQuery',{callback_query_id:q.id,text:'ثبت شد'});
    return result;
  } catch(err) {
    telegram_('answerCallbackQuery',{callback_query_id:q.id,text:err.publicMessage||'انجام نشد'});
    throw err;
  }
}
function requireAdmin_(secret){if(!secret||secret!==prop_(CORE.ADMIN_SECRET_PROP))fail_('UNAUTHORIZED','دسترسی مدیریتی مجاز نیست.');}
function findBooking_(tracking,phone){return objectsWithRows_(tab_(CORE.TABS.BOOKINGS)).find(x=>String(x.obj['Tracking Code'])===tracking&&String(x.obj.Phone)===phone)||null;}
function findByRequestId_(id){return objectsWithRows_(tab_(CORE.TABS.BOOKINGS)).find(x=>String(x.obj['Request ID'])===id)||null;}
function objectsWithRows_(sh){
  if(sh.getLastRow()<2)return [];const data=sh.getDataRange().getValues();const headers=data[0].map(String);
  return data.slice(1).map((v,i)=>({sheet:sh,row:i+2,obj:headers.reduce((o,h,j)=>(o[h]=v[j],o),{})}));
}
function readObjects_(ss,names){
  const sh=names.map(n=>ss.getSheetByName(n)).find(Boolean);if(!sh||sh.getLastRow()<2)return [];
  const data=sh.getDataRange().getDisplayValues();const h=data[0].map(x=>String(x||'').trim());
  return data.slice(1).map(v=>h.reduce((o,k,i)=>(o[k]=v[i],o),{}));
}
function appendObject_(sh,obj){const h=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];sh.appendRow(h.map(k=>obj[k]===undefined?'':obj[k]));}
function writeObject_(sh,row,obj){const h=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];sh.getRange(row,1,1,h.length).setValues([h.map(k=>obj[k]===undefined?'':obj[k])]);}
function tab_(name){const sh=staging_().getSheetByName(name);if(!sh)fail_('MISSING_TAB','شیت '+name+' در فایل Staging وجود ندارد. ابتدا initializeStagingSchema را اجرا کن.');return sh;}
function staging_(){const id=prop_(CORE.STAGING_PROP);if(!id)fail_('STAGING_ID_MISSING','Script Property '+CORE.STAGING_PROP+' تنظیم نشده است.');return SpreadsheetApp.openById(id);}
function cms_(){
  const id=prop_(CORE.CMS_ID_PROP);
  if(!id) fail_('CMS_UNAVAILABLE','شناسه CMS در تنظیمات خصوصی Staging پیکربندی نشده است.');
  return SpreadsheetApp.openById(id);
}
function prop_(key){return String(PropertiesService.getScriptProperties().getProperty(key)||'').trim();}
function withLock_(fn){const lock=LockService.getScriptLock();lock.waitLock(20000);try{return fn();}finally{lock.releaseLock();}}
function active_(v){const s=String(v===undefined?'':v).trim().toLowerCase();return !s||['true','yes','1','active','فعال','روشن','بله'].includes(s);}
function first_(o,keys){for(const k of keys)if(o[k]!==undefined&&String(o[k]).trim()!=='')return o[k];return '';}
function num_(v){const n=Number(String(v||'').replace(/[,٬\s]/g,''));return Number.isFinite(n)?n:0;}
function normalizeTime_(v){const s=String(v||'').trim().replace('.',':');const m=s.match(/^(\d{1,2}):(\d{1,2})$/);return m?('0'+m[1]).slice(-2)+':'+('0'+m[2]).slice(-2):'';}
function normalizeDate_(v){const s=String(v||'').trim().replace(/-/g,'/');return /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(s)?s.split('/').map((x,i)=>i?('0'+x).slice(-2):x).join('/'):s;}
function tomorrowJalali_(){
  const d=new Date(Date.now()+24*60*60*1000);
  const parts=new Intl.DateTimeFormat('en-u-ca-persian',{timeZone:CORE.TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
  const p={};parts.forEach(x=>p[x.type]=x.value);return p.year+'/'+p.month+'/'+p.day;
}
function parseJalaliDateTime_(date,time){
  const m=String(date||'').match(/^(\\d{4})[\\/-](\\d{1,2})[\\/-](\\d{1,2})$/);
  const t=normalizeTime_(time).match(/^(\\d{2}):(\\d{2})$/);
  if(!m||!t)return NaN;
  const g=jalaliToGregorian_(Number(m[1]),Number(m[2]),Number(m[3]));
  return new Date(Date.UTC(g.gy,g.gm-1,g.gd,Number(t[1])-3,Number(t[2])-30)).getTime();
}
function tehranTomorrowWeekday_(){
  const now=new Date();
  const p={};
  new Intl.DateTimeFormat('en-CA',{timeZone:CORE.TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).forEach(x=>p[x.type]=x.value);
  const d=new Date(Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day)+1));
  return d.getUTCDay();
}
function jalaliToGregorian_(jy,jm,jd){
  jy+=1595;
  let days=-355668+365*jy+Math.floor(jy/33)*8+Math.floor(((jy%33)+3)/4)+jd+(jm<7?(jm-1)*31:(jm-7)*30+186);
  let gy=400*Math.floor(days/146097);days%=146097;
  if(days>36524){gy+=100*Math.floor(--days/36524);days%=36524;if(days>=365)days++;}
  gy+=4*Math.floor(days/1461);days%=1461;
  if(days>365){gy+=Math.floor((days-1)/365);days=(days-1)%365;}
  let gd=days+1;const leap=(gy%4===0&&gy%100!==0)||gy%400===0;
  const md=[0,31,leap?29:28,31,30,31,30,31,31,30,31,30,31];let gm=1;
  while(gm<=12&&gd>md[gm]){gd-=md[gm];gm++;}
  return {gy,gm,gd};
}
function fail_(code,message){const e=new Error(message);e.code=code;e.publicMessage=message;throw e;}
function out_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}
