# Remaining full-suite failures

Baseline: commit `6f937c6`, extracted and tested under the same isolated network/database guard. These are actual remaining failures, not passing tests. No introduced failure names remain in the final comparison. A missing baseline failure can also reflect a retired or renamed scanner test; it is not automatically proof of a product bug fix.

## frontend

Final: {'tests': 460, 'pass': 428, 'fail': 32, 'cancelled': 0, 'skipped': 0}. Baseline: {'tests': 447, 'pass': 412, 'fail': 35, 'cancelled': 0, 'skipped': 0}.

1. **AuthContext preserves a session on unavailable checks and revalidates on tab return**
   - `client/tests/authSessionGuard.node.test.mjs:22:1`

2. **patient guards show a retry state instead of redirecting on an unavailable auth check**
   - `client/tests/authSessionGuard.node.test.mjs:32:1`

3. **walk-in now is an explicit choice; scheduled booking remains the default**
   - `client/tests/batch2WalkInWorkflow.node.test.mjs:7:1`

4. **newly created patient is reused after a failed queue attempt; receipt displays its queue number**
   - `client/tests/batch2WalkInWorkflow.node.test.mjs:34:1`

5. **branch form includes blank, standard, copy, preview and creation guidance**
   - `client/tests/batch3BranchSetup.node.test.mjs:5:1`

6. **dark-mode components explicitly handle translucent and weekday surfaces**
   - `client/tests/batch5VisualAndPaymentPreview.node.test.mjs:47:1`

7. **doctor availability sorts weekdays while preserving booking routes**
   - `client/tests/batch5VisualAndPaymentPreview.node.test.mjs:52:1`

8. **featured offers preserve selected promotion while providing bounded scroll controls**
   - `client/tests/batch5VisualAndPaymentPreview.node.test.mjs:58:1`

9. **registration, admin and staff intake use shared clinic-date bounds**
   - `client/tests/batch6PatientBirthdate.node.test.mjs:31:1`

10. **whole quantities and configured fractional precision are validated consistently**
   - `client/tests/billingRedesign20261105.node.test.mjs:17:1`

11. **included usage changes keep service charge stable, while promotion and explicit extras remain itemized**
   - `client/tests/billingRedesign20261105.node.test.mjs:23:1`

12. **Staff and Admin wrappers bind one shared checkout to their own permitted APIs**
   - `client/tests/billingRedesign20261105.node.test.mjs:50:1`

13. **measured extra-supply estimates round half cents the same way as backend billing**
   - `client/tests/billingRedesign20261105.node.test.mjs:58:1`

14. **pending clinical adjustments are reviewed on bill, not by a Doctor**
   - `client/tests/billingReplacement20261105.node.test.mjs:42:1`

15. **shared Billing navigation and action links retain the selected physical branch**
   - `client/tests/branchPortalNavigation20261022.node.test.mjs:17:1`

16. **charge adjustment UI preserves approval, reason and stock separation notices**
   - `client/tests/checkoutPresentation.node.test.mjs:49:1`

17. **registration and staff-assisted forms limit date selection, and age-only intake starts at 18**
   - `client/tests/fix17AdultForms.node.test.mjs:28:1`

18. **service editor and permissions have item search**
   - `client/tests/fix4Workflow20261111.node.test.mjs:21:1`

19. **booking never submits unverified email, stale slots or missing policy acceptance**
   - `client/tests/patientBookingFourStep.node.test.mjs:36:1`

20. **printed walk-in intake omits civil status and retains required patient contact fields**
   - `client/tests/patientCivilStatusRemoval20261112.node.test.mjs:5:1`

21. **unapproved catalog prices and placeholders are not presented as public prices**
   - `client/tests/patientDashboardRedesign.node.test.mjs:49:1`

22. **redesigned dashboard retains live services, offers, announcements, and booking paths**
   - `client/tests/patientDashboardRedesign.node.test.mjs:55:1`

23. **booking shows service price in selection, review, and success**
   - `client/tests/portraitPrescriptionPricingSchedules20261102.node.test.mjs:41:1`

24. **prescription prints as two landscape pads without signature box**
   - `client/tests/prescriptionPad20261102.node.test.mjs:10:1`

25. **existing fields print and duplicate across pads**
   - `client/tests/prescriptionPad20261102.node.test.mjs:16:1`

26. **long prescription continues on extra sheet without dropping medicine entries**
   - `client/tests/prescriptionPad20261102.node.test.mjs:46:1`

27. **staff with Checkout and Billing sees the same four billing tasks as Admin**
   - `client/tests/staffBillingUnified.node.test.mjs:10:1`

28. **billing-only staff cannot reach payment or cashier tools via query parameter**
   - `client/tests/staffBillingUnified.node.test.mjs:15:1`

29. **checkout-only staff can still read branch-owned bills but does not gain Admin approvals**
   - `client/tests/staffBillingUnified.node.test.mjs:22:1`

30. **dashboard and reports never display zero-valued KPIs on request failure**
   - `client/tests/superAdminDesign.node.test.mjs:23:1`

31. **branch activation retains the confirmation flow and readiness details**
   - `client/tests/superAdminDesign.node.test.mjs:32:1`

32. **branch and super admin explicitly return permanent deletion on successful delete**
   - `client/tests/systemSetupCategoryRefresh.node.test.mjs:18:1`

<details><summary>Failure excerpts</summary>

**AuthContext preserves a session on unavailable checks and revalidates on tab return**

```text
|-
    The input did not match the regular expression /const orderedRoles = hint \? \[hint\] : Object\.keys\(ENDPOINT_MAP\)/. Input:
    
    "import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'\n" +
      "import { logoutRoleSession } from '../utils/sessionLogout.mjs'\n" +
      "import { authCheckOutcome } from '../utils/authCheckResponse.mjs'\n" +
      '\n' +
      'const AuthContext = createContext()\n' +
      '\n' +
      'const ENDPOINT_MAP = {\n' +
      "  superadmin: '/api/admin/check-auth?portal=superadmin',\n" +
      "  admin: '/api/admin/check-auth',\n" +
      "  staff: '/api/staff/check-auth',\n" +
      "  doctor: '/api/doctor/check-a
```

**patient guards show a retry state instead of redirecting on an unavailable auth check**

```text
|-
    The input did not match the regular expression /authCheckError && !user/. Input:
    
    '// client/src/components/PatientRoute.jsx\n' +
      "import { Navigate, useLocation } from 'react-router-dom'\n" +
      "import { useAuth } from '../context/AuthContext'\n" +
      "import AuthCheckFallback from './AuthCheckFallback'\n" +
      '\n' +
      'const PatientRoute = ({ children }) => {\n' +
      '  const location = useLocation()\n' +
      '  const { user, role, ready, authCheckError, checkAuth } = useAuth()\n' +
      '  if (!ready) return (\n' +
      '    <div className="flex items-center justify-center h-screen">\n' +
      '      <div className="w-8 h-8 border-4 border-slate
```

**walk-in now is an explicit choice; scheduled booking remains the default**

```text
|-
    The input did not match the regular expression /useState\('scheduled'\)/. Input:
    
    "import { portalBaseForPath } from '../../utils/branchPortalPath.mjs'\r\n" +
      "import { formatQueueLabel } from '../../utils/queueLabel.mjs'\r\n" +
      "import { useCallback, useEffect, useRef, useState } from 'react'\r\n" +
      "import { useBlocker, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'\r\n" +
      "import useClinicRefresh from '../../hooks/useClinicRefresh'\r\n" +
      'import {\r\n' +
      '  MdArrowBack, MdArrowForward, MdCheck, MdCheckCircle,\r\n' +
      '  MdOpenInNew, MdSearch,\r\n' +
      '  MdWarningAmber,\r\n' +
      "} from 'react-icons
```

**newly created patient is reused after a failed queue attempt; receipt displays its queue number**

```text
|-
    The input did not match the regular expression /success\.receipt\?\.queue_number/. Input:
    
    "import { portalBaseForPath } from '../../utils/branchPortalPath.mjs'\r\n" +
      "import { formatQueueLabel } from '../../utils/queueLabel.mjs'\r\n" +
      "import { useCallback, useEffect, useRef, useState } from 'react'\r\n" +
      "import { useBlocker, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'\r\n" +
      "import useClinicRefresh from '../../hooks/useClinicRefresh'\r\n" +
      'import {\r\n' +
      '  MdArrowBack, MdArrowForward, MdCheck, MdCheckCircle,\r\n' +
      '  MdOpenInNew, MdSearch,\r\n' +
      '  MdWarningAmber,\r\n' +
      "} from 're
```

**branch form includes blank, standard, copy, preview and creation guidance**

```text
|-
    The input did not match the regular expression /Source Branch \*/. Input:
    
    "import useClinicRefresh from '../../../hooks/useClinicRefresh'\n" +
      "import {useCallback,useEffect,useMemo,useRef,useState} from 'react'\n" +
      "import {NavLink} from 'react-router-dom'\n" +
      "import {MdAdd,MdRefresh,MdBusiness,MdEdit,MdChevronRight,MdWarningAmber,MdPhone,MdEmail,MdLocationOn,MdMedicalServices,MdMap} from 'react-icons/md'\n" +
      "import {fetchJson,PageHead,Card,Pill,Modal,Field,Banner,Empty,Loading,SearchInput,PrimaryButton,SecondaryButton} from './shared'\n" +
      "import {useToast} from '../../../components/ui/ToastProvider'\n" +
      "import {normalizePhilippin
```

**dark-mode components explicitly handle translucent and weekday surfaces**

```text
|-
    The input did not match the regular expression /bg-sky-50\/60 dark:bg-sky-950\/50/. Input:
    
    "import { useLocation, useNavigate } from 'react-router-dom'\n" +
      "import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'\n" +
      "import { createPortal } from 'react-dom'\n" +
      "import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'\n" +
      "import { MdDone, MdNotifications } from 'react-icons/md'\n" +
      'import {\n' +
      '  getNotifications,\n' +
      '  getNotificationDestination,\n' +
      '  markNotificationRead,\n' +
      '  readAllNotifications,\n' +
      "} from '../services/portal.service'\n" +
   
```

**doctor availability sorts weekdays while preserving booking routes**

```text
|-
    The input did not match the regular expression /WEEKDAY_ORDER = \['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'\]/. Input:
    
    "import { usePatientBranch } from '../../context/PatientBranchContext'\n" +
      "import useClinicRefresh from '../../hooks/useClinicRefresh'\n" +
      "import { useCallback, useEffect, useState } from 'react'\n" +
      "import { NavLink } from 'react-router-dom'\n" +
      "import { buildSlotBookingPath } from '../../utils/bookingHandoff.mjs'\n" +
      "import { MdCalendarToday, MdChevronLeft, MdChevronRight, MdEventBusy, MdRefresh } from 'react-icons/md'\n" +
      "import { getDoctorsAvailability } from '../../services/pati
```

**featured offers preserve selected promotion while providing bounded scroll controls**

```text
|-
    The input did not match the regular expression /promotion_id=\$\{encodeURIComponent\(p\.id\)\}/. Input:
    
    "import { useCallback, useEffect, useRef, useState } from 'react'\n" +
      "import { NavLink } from 'react-router-dom'\n" +
      "import { MdChevronLeft, MdChevronRight, MdArrowForward } from 'react-icons/md'\n" +
      "import { visiblePromotions } from '../../utils/promotionPresentation.mjs'\n" +
      "import { promotionBookingPath } from '../../utils/promotionBookingPath.mjs'\n" +
      'export { visiblePromotions }\n' +
      '\n' +
      'const formatOfferEndDate = (value) => {\n' +
      "  const match = /^(\\d{4})-(\\d{2})-(\\d{2})/.exec(String(value || ''))\n" +
```

**registration, admin and staff intake use shared clinic-date bounds**

```text
'src/pages/staffPage/Staff_WalkInQueue.jsx'
```

**whole quantities and configured fractional precision are validated consistently**

```text
|-
    Expected values to be strictly equal:
    + actual - expected
    
    + 'Use a positive whole number.'
    - ''
```

**included usage changes keep service charge stable, while promotion and explicit extras remain itemized**

```text
|-
    Expected values to be strictly deep-equal:
    + actual - expected
    
      {
    +   materialAdjustment: 5,
        promotion: 135,
    +   service: 545,
    -   service: 540,
        supplies: 0,
    +   total: 410
    -   total: 405
      }
```

**Staff and Admin wrappers bind one shared checkout to their own permitted APIs**

```text
|-
    The input did not match the regular expression /<BillCheckout services=\{services\} admin/. Input:
    
    "import FinancialBillBreakdown from '../../components/billing/FinancialBillBreakdown'\r\n" +
      "import ChargeSummaryBreakdown from '../../components/billing/ChargeSummaryBreakdown'\r\n" +
      "import {useAuth} from '../../context/AuthContext'\r\n" +
      "import {paymentRequestKey} from '../../utils/paymentRequest.mjs'\r\n" +
      "import ChargeAdjustmentsPanel from '../../components/billing/ChargeAdjustmentsPanel'\r\n" +
      "import { CheckoutProgress, CheckoutStatus, CheckoutOverview } from '../../components/billing/CheckoutExperience'\r\n" +
      "import { useEffec
```

**measured extra-supply estimates round half cents the same way as backend billing**

```text
|-
    Expected values to be strictly deep-equal:
    + actual - expected
    
    + null
    - {
    -   promotion: 135,
    -   service: 540,
    -   supplies: 0.04,
    -   total: 405.04
    - }
```

**pending clinical adjustments are reviewed on bill, not by a Doctor**

```text
|-
    The input did not match the regular expression /staffOnly && <div className/. Input:
    
    "import {useCallback,useEffect,useRef,useState} from 'react'\r\n" +
      "import { MdCheckCircle, MdHourglassEmpty, MdInfoOutline, MdPayments, MdWarningAmber } from 'react-icons/md'\r\n" +
      "import Modal from '../ui/Modal'\r\n" +
      "const money=n=>`₱${(Number(n)||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`\r\n" +
      'const base=()=>{\r\n' +
      '  const path=window.location.pathname\r\n' +
      '  const branch=path.match(/^\\/superadmin\\/branches\\/(\\d+)(?:\\/|$)/)\r\n' +
      '  if(branch)return `/api/branches/workspace/${branch[1]}/legac
```

**shared Billing navigation and action links retain the selected physical branch**

```text
|-
    The input did not match the regular expression /api.portal.base/. Input:
    
    "import { useCallback, useEffect, useMemo, useRef, useState } from 'react'\r\n" +
      "import { Link, useLocation, useSearchParams } from 'react-router-dom'\r\n" +
      "import { MdArrowForward, MdClose, MdPayments, MdReceiptLong, MdRefresh, MdSearch } from 'react-icons/md'\r\n" +
      "import { getBills as getAdminBills } from '../../services/admin.service'\r\n" +
      "import { getBills as getStaffBills } from '../../services/staff.service'\r\n" +
      "import { useAuth } from '../../context/AuthContext'\r\n" +
      "import { hasStaffPermission } from '../../config/staffPermissions'\r\n" +
     
```

**charge adjustment UI preserves approval, reason and stock separation notices**

```text
'approved reductions'
```

**registration and staff-assisted forms limit date selection, and age-only intake starts at 18**

```text
|-
    The input did not match the regular expression /getMaxPatientBirthdate/. Input:
    
    "import { portalBaseForPath } from '../../utils/branchPortalPath.mjs'\r\n" +
      "import { formatQueueLabel } from '../../utils/queueLabel.mjs'\r\n" +
      "import { useCallback, useEffect, useRef, useState } from 'react'\r\n" +
      "import { useBlocker, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'\r\n" +
      "import useClinicRefresh from '../../hooks/useClinicRefresh'\r\n" +
      'import {\r\n' +
      '  MdArrowBack, MdArrowForward, MdCheck, MdCheckCircle,\r\n' +
      '  MdOpenInNew, MdSearch,\r\n' +
      '  MdWarningAmber,\r\n' +
      "} from 'react-icons/
```

**service editor and permissions have item search**

```text
|-
    The input did not match the regular expression /inv\.barcode/. Input:
    
    "import {useAuth} from '../../context/AuthContext'\r\n" +
      "import { useEffect, useMemo, useState } from 'react'\r\n" +
      "import { portalBaseForPath, canManageServicePricingAtPath } from '../../utils/branchPortalPath.mjs'\r\n" +
      "import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'\r\n" +
      "import { MdAdd, MdArrowBack, MdCheck, MdClose, MdDelete, MdLock, MdPayments } from 'react-icons/md'\r\n" +
      "import { createBillingCatalogService, deleteBillingCatalogService, getBillingCatalog, getInventory, getSystemSetup, updateBillingCatalogService } from '
```

**booking never submits unverified email, stale slots or missing policy acceptance**

```text
|-
    The input did not match the regular expression /emailStatus !== 'verified'/. Input:
    
    "import {promotionQuote,peso} from '../../utils/promotionPricing.mjs'\r\n" +
      "import { formatPublicServicePrice } from '../../utils/patientServicePresentation.mjs'\r\n" +
      "import { usePatientBranch } from '../../context/PatientBranchContext'\r\n" +
      "import useClinicRefresh from '../../hooks/useClinicRefresh'\r\n" +
      '// client/src/pages/patientPage/BookAppointment.jsx\r\n' +
      '// Four-step patient-facing flow. Existing backend validation is authoritative.\r\n' +
      '\r\n' +
      "import { useCallback, useEffect, useRef, useState } from 'react'\r\n" +
      "impo
```

**printed walk-in intake omits civil status and retains required patient contact fields**

```text
'Full Name'
```

**unapproved catalog prices and placeholders are not presented as public prices**

```text
|-
    Expected values to be strictly equal:
    
    1 !== null
```

**redesigned dashboard retains live services, offers, announcements, and booking paths**

```text
|-
    The input did not match the regular expression /publicServicePrice\(service\)/. Input:
    
    "import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'\n" +
      "import { NavLink } from 'react-router-dom'\n" +
      "import { MdArrowForward, MdMedicalServices, MdFace, MdRefresh } from 'react-icons/md'\n" +
      "import { getBookingServices } from '../../services/patient.service'\n" +
      "import { formatPublicServicePrice, listServicesForCategory } from '../../utils/patientServicePresentation.mjs'\n" +
      "import { paginatePatientServices } from '../../utils/patientServicePagination.mjs'\n" +
      "import Pagination from '../ui/Pagination'\n" +
    
```

**booking shows service price in selection, review, and success**

```text
|-
    The input did not match the regular expression /Service price: \{formatPublicServicePrice\(service\)\}/. Input:
    
    "import {promotionQuote,peso} from '../../utils/promotionPricing.mjs'\r\n" +
      "import { formatPublicServicePrice } from '../../utils/patientServicePresentation.mjs'\r\n" +
      "import { usePatientBranch } from '../../context/PatientBranchContext'\r\n" +
      "import useClinicRefresh from '../../hooks/useClinicRefresh'\r\n" +
      '// client/src/pages/patientPage/BookAppointment.jsx\r\n' +
      '// Four-step patient-facing flow. Existing backend validation is authoritative.\r\n' +
      '\r\n' +
      "import { useCallback, useEffect, useRef, useState } fro
```

**prescription prints as two landscape pads without signature box**

```text
|-
    The input did not match the regular expression /@page\{size:letter landscape/. Input:
    
    '<!doctype html><html><head><meta charset="utf-8">\n' +
      '    <title>Prescription - Demo Patient</title>\n' +
      '    <style>\n' +
      '      @page{size:A5 portrait;margin:0}\n' +
      '      *{box-sizing:border-box}\n' +
      '      html,body{width:148mm;margin:0;padding:0;color:#000;font-family:Arial,Helvetica,sans-serif;background:#fff}\n' +
      '      .sheet{width:148mm;height:210mm;position:relative;break-after:page;page-break-after:always}\n' +
      '      .sheet:last-child{break-after:auto;page-break-after:auto}\n' +
      '      .pad{position:absolute;top:8mm;left:13.1
```

**existing fields print and duplicate across pads**

```text
|-
    November 2, 2026
    
    1 !== 2
```

**long prescription continues on extra sheet without dropping medicine entries**

```text
|-
    Expected values to be strictly equal:
    
    0 !== 3
```

**staff with Checkout and Billing sees the same four billing tasks as Admin**

```text
|-
    Expected values to be strictly deep-equal:
    + actual - expected
    
      [
    +   'payments',
    +   'history'
    -   'checkout',
    -   'transactions',
    -   'payment-issues',
    -   'cash'
      ]
```

**billing-only staff cannot reach payment or cashier tools via query parameter**

```text
|-
    Expected values to be strictly equal:
    + actual - expected
    
    + 'payments'
    - 'transactions'
```

**checkout-only staff can still read branch-owned bills but does not gain Admin approvals**

```text
|-
    Expected values to be strictly deep-equal:
    + actual - expected
    
      [
    +   'payments',
    +   'history'
    -   'checkout',
    -   'transactions',
    -   'payment-issues',
    -   'cash'
      ]
```

**dashboard and reports never display zero-valued KPIs on request failure**

```text
|-
    The input did not match the regular expression /rows === null \? <Banner/. Input:
    
    "import InventoryPulse from '../InventoryPulse'\n" +
      "import {useEffect,useState} from 'react'\n" +
      "import {NavLink} from 'react-router-dom'\n" +
      "import {MdBusiness,MdCalendarMonth,MdPendingActions,MdPayments,MdCheckCircle,MdPersonOff,MdRefresh,MdArrowForward,MdPeople,MdHistory,MdWarningAmber,MdBlock} from 'react-icons/md'\n" +
      "import {fetchJson,Card,PageHead,StatCard,Pill,Banner,Loading,Empty,pesos,whole,todayISO,beforeISO,SecondaryButton} from './shared'\n" +
      "import {isValidReportPeriod,sumBranchMetric} from './reportFormat'\n" +
      "import {loadOverviewSec
```

**branch activation retains the confirmation flow and readiness details**

```text
|-
    The input did not match the regular expression /setConfirm\(b\)/. Input:
    
    "import useClinicRefresh from '../../../hooks/useClinicRefresh'\n" +
      "import {useCallback,useEffect,useMemo,useRef,useState} from 'react'\n" +
      "import {NavLink} from 'react-router-dom'\n" +
      "import {MdAdd,MdRefresh,MdBusiness,MdEdit,MdChevronRight,MdWarningAmber,MdPhone,MdEmail,MdLocationOn,MdMedicalServices,MdMap} from 'react-icons/md'\n" +
      "import {fetchJson,PageHead,Card,Pill,Modal,Field,Banner,Empty,Loading,SearchInput,PrimaryButton,SecondaryButton} from './shared'\n" +
      "import {useToast} from '../../../components/ui/ToastProvider'\n" +
      "import {normalizePhilippine
```

**branch and super admin explicitly return permanent deletion on successful delete**

```text
|-
    The expression evaluated to a falsy value:
    
      assert.ok(route.includes("withSetup('/system-setup/service-categories/:id','delete',deleteCategory)"))
```

</details>

## backend_node

Final: {'tests': 980, 'pass': 908, 'fail': 72, 'cancelled': 0, 'skipped': 0}. Baseline: {'tests': 924, 'pass': 850, 'fail': 74, 'cancelled': 0, 'skipped': 0}.

1. **non promotional news cannot claim a promotion**
   - `server/tests/announcementBookingValidation.node.test.cjs:26:1`

2. **manual reminder explains unverified email and disabled SMS, without sending**
   - `server/tests/appointments/pdfReviewFixes20261029.node.test.cjs:30:1`

3. **manual reminder explains unverified SMS number**
   - `server/tests/appointments/pdfReviewFixes20261029.node.test.cjs:35:1`

4. **manual reminder explains SMS provider unavailable**
   - `server/tests/appointments/pdfReviewFixes20261029.node.test.cjs:40:1`

5. **saves trusted branch/service/date/terms snapshot, not client-supplied terms**
   - `server/tests/batch4/selectedPromotion.node.cjs:27:1`

6. **rejects promotion not linked to active branch-owned service**
   - `server/tests/batch4/selectedPromotion.node.cjs:40:1`

7. **complete consultation with none reduction decision preserves promotion and actual consumption**
   - `server/tests/billing/consultationLifecycle20261105.node.test.cjs:46:54`

8. **complete consultation with approved reduction decision preserves promotion and actual consumption**
   - `server/tests/billing/consultationLifecycle20261105.node.test.cjs:46:54`

9. **complete consultation with rejected reduction decision preserves promotion and actual consumption**
   - `server/tests/billing/consultationLifecycle20261105.node.test.cjs:46:54`

10. **quantity-only changes alter inventory consumption without changing service price or fee**
   - `server/tests/billing/quantitiesAndLedger20261105.node.test.cjs:14:1`

11. **fractional included or extra discrete items are rejected, measured extras bill once**
   - `server/tests/billing/quantitiesAndLedger20261105.node.test.cjs:21:1`

12. **fractional supply currency rounds half-cent products consistently with the client estimate**
   - `server/tests/billing/quantitiesAndLedger20261105.node.test.cjs:58:1`

13. **booked and eligible added service both receive Christmas 25%; stock items do not**
   - `server/tests/billing/servicePromotions20261111.node.test.cjs:15:1`

14. **non-eligible added services receive no booked promotion**
   - `server/tests/billing/servicePromotions20261111.node.test.cjs:25:1`

15. **deleting the live booked promotion preserves its saved discount only on the booked service**
   - `server/tests/billing/servicePromotions20261111.node.test.cjs:56:1`

16. **deleted booked promotion remains capped and is not counted twice on repeated saves**
   - `server/tests/billing/servicePromotions20261111.node.test.cjs:70:1`

17. **readiness obtains branch-scoped accurate counts with 4 parameterized grouped queries**
   - `server/tests/booking/batch12Readiness.node.cjs:24:1`

18. **legacy organization-level readiness still works without a branch filter**
   - `server/tests/booking/batch12Readiness.node.cjs:54:1`

19. **branch slot read allows appointment privilege but not doctor schedule modification**
   - `server/tests/branchIntegration/batch2AppointmentWorkflows.node.cjs:53:1`

20. **walk-in mode uses existing authorized queue endpoint and receipt instead of scheduled booking**
   - `server/tests/branchIntegration/batch2AppointmentWorkflows.node.cjs:58:1`

21. **branch doctor schedule endpoint uses weekday order and retains doctor ownership**
   - `server/tests/branchIntegration/batch5WeekdayOrder.node.cjs:10:1`

22. **deactivated branch is denied**
   - `server/tests/branchIntegration/multibranchAdditions.node.cjs:24:1`

23. **all branch report operational queries use the authorized branch**
   - `server/tests/branchIntegration/multibranchPhaseOne.node.cjs:5:1`

24. **billing settings are registered before dynamic bill id**
   - `server/tests/branchIntegration/multibranchPhaseOne.node.cjs:15:1`

25. **inactive branch operational actions are disabled while status switch remains accessible**
   - `server/tests/branches/branchReactivation.node.test.cjs:138:1`

26. **active/inactive status filter compares strings correctly**
   - `server/tests/branches/branchReactivation.node.test.cjs:145:1`

27. **public navigation is responsive and routes back to anchored home sections**
   - `server/tests/branching/branchAdminCreate20261017.node.cjs:111:1`

28. **stock requests are confined to the requested branch**
   - `server/tests/branching/branchReadContracts.node.cjs:145:1`

29. **pending usage checks available stock and picks the next stockroom if needed**
   - `server/tests/clinicalReservations20261111.node.cjs:17:1`

30. **pending usage refuses an item without enough stock**
   - `server/tests/clinicalReservations20261111.node.cjs:27:1`

31. **failure history migration adds one nullable field without touching existing records**
   - `server/tests/deployment/billingFailureMigration20261105.node.test.cjs:23:1`

32. **migration resumes when TiDB DDL succeeded before the migration record was written**
   - `server/tests/deployment/billingFailureMigration20261105.node.test.cjs:29:1`

33. **walk-in age validation requires 18+ at server level**
   - `server/tests/fix17AdultPolicy.node.cjs:58:1`

34. **one recipient is notified once after repeated worker runs, from the same DB transaction as the delivery ledger**
   - `server/tests/gateway/automaticInappPublications20261105.node.test.cjs:25:1`

35. **every inventory log INSERT contains the physical branch**
   - `server/tests/gateway/paymongoQr.node.cjs:54:1`

36. **homepage offers are hidden for anonymous, guest-verified and invalid patient sessions**
   - `server/tests/guestPromotions20261112.node.cjs:76:1`

37. **public news excludes promotional posts and direct promotion requests cannot bypass sign-in**
   - `server/tests/guestPromotions20261112.node.cjs:90:1`

38. **registered patients retain promotional news lists and details**
   - `server/tests/guestPromotions20261112.node.cjs:99:1`

39. **draft announcement accepts plain-text content**
   - `server/tests/marketing/announcements.node.cjs:18:1`

40. **rejects unsafe external CTA URLs**
   - `server/tests/marketing/announcements.node.cjs:20:1`

41. **rejects protocol-relative redirects**
   - `server/tests/marketing/announcements.node.cjs:21:1`

42. **uses Manila date during UTC previous day and accepts newborns**
   - `server/tests/patients/batch6Birthdates.node.cjs:18:1`

43. **respects birthday-specific age-100 boundary and does not block infants**
   - `server/tests/patients/batch6Birthdates.node.cjs:25:1`

44. **billing and all reschedule paths preserve selected promotional discount boundaries**
   - `server/tests/promotions/promotionPricing20261105.node.cjs:25:1`

45. **first-login schema, invitation, login, password reset and UI all use the same flag**
   - `server/tests/security/adminFirstLogin20261022.node.cjs:56:1`

46. **new additive migration stores draft and published policy separately**
   - `server/tests/security/bookingPolicyContent.node.test.cjs:57:1`

47. **public page is routed, linked from the footer, and opened from the booking flow**
   - `server/tests/security/bookingPolicyContent.node.test.cjs:68:1`

48. **appointment validates the doctor and service inside the requested branch transaction**
   - `server/tests/security/branchWriteRemediation20261015.node.cjs:76:1`

49. **patient booking explicitly requires branch-owned doctor and service**
   - `server/tests/security/multiBranch20261009.node.cjs:32:1`

50. **Patient promotion API rejects absent branch and cannot return other branch offers**
   - `server/tests/security/oct28StaffAndPatientBranches.node.cjs:49:1`

51. **new compatibility endpoints have branch predicates, not JS-only list filtering**
   - `server/tests/security/originalAdminPortalBranch20261009.node.cjs:20:1`

52. **patient doctor schedules require branch-scoped active doctor**
   - `server/tests/security/patientBranchIsolation20261009.node.cjs:7:1`

53. **queue display unlock refuses an invalid branch**
   - `server/tests/security/queueDisplayBranch20261015.node.cjs:65:1`

54. **queue display session is HttpOnly, branch-bound, and live queue queries enforce that branch**
   - `server/tests/security/queueDisplayBranch20261015.node.cjs:72:1`

55. **dashboard and reports separate billed from collected and have date selectors**
   - `server/tests/security/superAdminRedesign20261009.node.cjs:16:1`

56. **Super Admin credits API is protected and never exposes key**
   - `server/tests/semaphoreBalance20261111.node.cjs:27:1`

57. **branch payment setting and gateway never enable QR Ph automatically**
   - `server/tests/simplification/stockRoomMigrationFollowup.node.test.cjs:30:1`

58. **branch and Staff System Setup use the same physical stock allocation summary**
   - `server/tests/stockRoomPdfFix.node.test.cjs:37:1`

59. **walk-in email can register and SMS activation upgrades the same patient without changing visit or financial history**
   - `server/tests/walkInRegistration20261112.node.cjs:6:1`

60. **registration normalizes case and phone formatting when linking the walk-in record**
   - `server/tests/walkInRegistration20261112.node.cjs:28:1`

61. **real patient accounts remain protected even when an old is_walk_in flag is still 1**
   - `server/tests/walkInRegistration20261112.node.cjs:33:1`

62. **an email-only match with a different or missing mobile cannot claim a walk-in history**
   - `server/tests/walkInRegistration20261112.node.cjs:40:1`

63. **identity mismatches and banned walk-ins do not overwrite the patient record**
   - `server/tests/walkInRegistration20261112.node.cjs:48:1`

64. **a different registered patient owning the requested email blocks registration**
   - `server/tests/walkInRegistration20261112.node.cjs:55:1`

65. **invalid and expired OTPs do not activate credentials; five wrong attempts invalidate the code**
   - `server/tests/walkInRegistration20261112.node.cjs:61:1`

66. **verification rechecks credentials and email ownership changed after sending the OTP**
   - `server/tests/walkInRegistration20261112.node.cjs:73:1`

67. **activation and OTP consumption roll back if consent, audit or uniqueness checks fail**
   - `server/tests/walkInRegistration20261112.node.cjs:82:1`

68. **simultaneous verification cannot activate twice or issue a second session**
   - `server/tests/walkInRegistration20261112.node.cjs:92:1`

69. **a new patient without a matching walk-in still registers normally**
   - `server/tests/walkInRegistration20261112.node.cjs:98:1`

70. **an unused email may replace the walk-in email only after verified mobile ownership**
   - `server/tests/walkInRegistration20261112.node.cjs:105:1`

71. **missing legacy demographics can be completed while an unchanged verified email remains verified**
   - `server/tests/walkInRegistration20261112.node.cjs:112:1`

72. **a patient record introduced after the OTP request cannot silently change the activation target**
   - `server/tests/walkInRegistration20261112.node.cjs:119:1`

<details><summary>Failure excerpts</summary>

**non promotional news cannot claim a promotion**

```text
'Missing expected exception.'
```

**manual reminder explains unverified email and disabled SMS, without sending**

```text
'Only future, confirmed appointments can receive a reminder.'
```

**manual reminder explains unverified SMS number**

```text
'Only future, confirmed appointments can receive a reminder.'
```

**manual reminder explains SMS provider unavailable**

```text
'Only future, confirmed appointments can receive a reminder.'
```

**saves trusted branch/service/date/terms snapshot, not client-supplied terms**

```text
'Promotions require a registered patient account. Guests can book at the regular price.'
```

**rejects promotion not linked to active branch-owned service**

```text
|-
    Expected values to be strictly deep-equal:
    + actual - expected
    
      Comparison {
    +   code: 'PROMOTION_ACCOUNT_REQUIRED',
    +   status: 403
    -   code: 'PROMOTION_SERVICE_MISMATCH',
    -   status: 409
      }
```

**complete consultation with none reduction decision preserves promotion and actual consumption**

```text
'saveFollowup is not defined'
```

**complete consultation with approved reduction decision preserves promotion and actual consumption**

```text
'saveFollowup is not defined'
```

**complete consultation with rejected reduction decision preserves promotion and actual consumption**

```text
'saveFollowup is not defined'
```

**quantity-only changes alter inventory consumption without changing service price or fee**

```text
'Liquid requires a positive whole number of ml.'
```

**fractional included or extra discrete items are rejected, measured extras bill once**

```text
'Liquid requires a positive whole number of ml.'
```

**fractional supply currency rounds half-cent products consistently with the client estimate**

```text
'Liquid requires a positive whole number of ml.'
```

**booked and eligible added service both receive Christmas 25%; stock items do not**

```text
'This offer requires a registered patient account. Guests cannot receive promotional discounts.'
```

**non-eligible added services receive no booked promotion**

```text
'This offer requires a registered patient account. Guests cannot receive promotional discounts.'
```

**deleting the live booked promotion preserves its saved discount only on the booked service**

```text
'This offer requires a registered patient account. Guests cannot receive promotional discounts.'
```

**deleted booked promotion remains capped and is not counted twice on repeated saves**

```text
'This offer requires a registered patient account. Guests cannot receive promotional discounts.'
```

**readiness obtains branch-scoped accurate counts with 4 parameterized grouped queries**

```text
|-
    The expression evaluated to a falsy value:
    
      assert.ok(seen.every(({ sql, params }) => sql.includes('branch_id = ?') && params.length === 1 && params[0] === 7))
```

**legacy organization-level readiness still works without a branch filter**

```text
|-
    The expression evaluated to a falsy value:
    
      assert.ok(seen.every(({ sql, params }) => !sql.includes('branch_id = ?') && params.length === 0))
```

**branch slot read allows appointment privilege but not doctor schedule modification**

```text
|-
    The input did not match the regular expression /available-slots`,\.\.\.middle,allowAnyPermission\('appointments','doctor_schedules'\)/. Input:
    
    "const { listBranchPatients, getBranchPatientRecord } = require('../utils/patientRecordView')\r\n" +
      "const {afterSuccessfulMutation}=require('../utils/clinicEvents')\r\n" +
      "const {attachBatchesToInventory}=require('../utils/inventoryBatches')\r\n" +
      "const {hydrateBillingCatalogRows}=require('../utils/billing')\r\n" +
      "const {loadSuperAdminReport,SECTIONS}=require('../utils/superAdminReports')\r\n" +
      '// Physical-branch management. Unlike the legacy admin controller, every data\r\n' +
      '// query her
```

**walk-in mode uses existing authorized queue endpoint and receipt instead of scheduled booking**

```text
|-
    The input did not match the regular expression /success\.receipt\?\.queue_number/. Input:
    
    "import { portalBaseForPath } from '../../utils/branchPortalPath.mjs'\r\n" +
      "import { formatQueueLabel } from '../../utils/queueLabel.mjs'\r\n" +
      "import { useCallback, useEffect, useRef, useState } from 'react'\r\n" +
      "import { useBlocker, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'\r\n" +
      "import useClinicRefresh from '../../hooks/useClinicRefresh'\r\n" +
      'import {\r\n' +
      '  MdArrowBack, MdArrowForward, MdCheck, MdCheckCircle,\r\n' +
      '  MdOpenInNew, MdSearch,\r\n' +
      '  MdWarningAmber,\r\n' +
      "} from 're
```

**branch doctor schedule endpoint uses weekday order and retains doctor ownership**

```text
|-
    The input did not match the regular expression /SELECT \* FROM doctor_schedules WHERE doctor_id=\? ORDER BY FIELD\(day_of_week,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'\)/. Input:
    
    "const { listBranchPatients, getBranchPatientRecord } = require('../utils/patientRecordView')\r\n" +
      "const {afterSuccessfulMutation}=require('../utils/clinicEvents')\r\n" +
      "const {attachBatchesToInventory}=require('../utils/inventoryBatches')\r\n" +
      "const {hydrateBillingCatalogRows}=require('../utils/billing')\r\n" +
      "const {loadSuperAdminReport,SECTIONS}=require('../utils/superAdminReports')\r\n" +
      '// Physical-branch management. Unlike 
```

**deactivated branch is denied**

```text
'should not call next'
```

**all branch report operational queries use the authorized branch**

```text
'Missing test mock: ../utils/inventoryReportStock'
```

**billing settings are registered before dynamic bill id**

```text
'Missing test mock: ../utils/branchStockRoomSummary'
```

**inactive branch operational actions are disabled while status switch remains accessible**

```text
|-
    The input did not match the regular expression /disabled\s+aria-label=\{`Manage \$\{b\.name\} \(inactive\)`\}/. Input:
    
    "import useClinicRefresh from '../../../hooks/useClinicRefresh'\n" +
      "import {useCallback,useEffect,useMemo,useRef,useState} from 'react'\n" +
      "import {NavLink} from 'react-router-dom'\n" +
      "import {MdAdd,MdRefresh,MdBusiness,MdEdit,MdChevronRight,MdWarningAmber,MdPhone,MdEmail,MdLocationOn,MdMedicalServices,MdMap} from 'react-icons/md'\n" +
      "import {fetchJson,PageHead,Card,Pill,Modal,Field,Banner,Empty,Loading,SearchInput,PrimaryButton,SecondaryButton} from './shared'\n" +
      "import {useToast} from '../../../components/ui/ToastPro
```

**active/inactive status filter compares strings correctly**

```text
|-
    The input did not match the regular expression /filter===\(Number\(b\.is_active\)\?'active':'inactive'\)/. Input:
    
    "import useClinicRefresh from '../../../hooks/useClinicRefresh'\n" +
      "import {useCallback,useEffect,useMemo,useRef,useState} from 'react'\n" +
      "import {NavLink} from 'react-router-dom'\n" +
      "import {MdAdd,MdRefresh,MdBusiness,MdEdit,MdChevronRight,MdWarningAmber,MdPhone,MdEmail,MdLocationOn,MdMedicalServices,MdMap} from 'react-icons/md'\n" +
      "import {fetchJson,PageHead,Card,Pill,Modal,Field,Banner,Empty,Loading,SearchInput,PrimaryButton,SecondaryButton} from './shared'\n" +
      "import {useToast} from '../../../components/ui/ToastProvider
```

**public navigation is responsive and routes back to anchored home sections**

```text
|-
    The input did not match the regular expression /className="sticky top-0 z-50/. Input:
    
    '// client/src/components/layouts/Layout.jsx\n' +
      '// UPDATED:\n' +
      '//  1. Footer is no longer "fixed" — it stays at bottom of page content naturally.\n' +
      '//  2. Footer now shows Terms of Service and Privacy Policy links (read from CMS).\n' +
      '//  3. Footer links are hidden when their URL is blank (admin can toggle them by clearing the field).\n' +
      '//  4. Facebook icon replaced with FaFacebook from react-icons (was already there — kept).\n' +
      '\n' +
      "import { useEffect, useState } from 'react'\n" +
      "import { NavLink, Outlet, useLocation } f
```

**stock requests are confined to the requested branch**

```text
'x.api.readTransferGroups is not a function'
```

**pending usage checks available stock and picks the next stockroom if needed**

```text
"Cannot destructure property 'writeInventoryActivity' of 'require(...)' as it is null."
```

**pending usage refuses an item without enough stock**

```text
"Cannot destructure property 'writeInventoryActivity' of 'require(...)' as it is null."
```

**failure history migration adds one nullable field without touching existing records**

```text
'Daily queue migration required: uniq_queue_branch_doctor_day_number'
```

**migration resumes when TiDB DDL succeeded before the migration record was written**

```text
'Daily queue migration required: uniq_queue_branch_doctor_day_number'
```

**walk-in age validation requires 18+ at server level**

```text
|-
    The input did not match the regular expression /age<18 \|\| age>120/. Input:
    
    "const { availableStockSql } = require('../utils/inventoryReportStock')\r\n" +
      "const { writeInventoryActivity } = require('../utils/inventoryActivity')\r\n" +
      "const { notifyDoctorOnConfirmation } = require('../utils/doctorConfirmationNotifications')\r\n" +
      "const { isUnifiedBillingStockOut, postClinicalReservations, assertNoUnpostedStockWithFeatureOff } = require('../utils/clinicalInventoryReservations')\r\n" +
      '// server/controllers/staff.controller.js\r\n' +
      "// FIX 1: getDoctors now returns the 'type' field so Walk-in Queue doctor filter works\r\n" +
      '// FIX 2
```

**one recipient is notified once after repeated worker runs, from the same DB transaction as the delivery ledger**

```text
|-
    Expected values to be strictly equal:
    + actual - expected
    
    + 'pending'
    - 'completed'
```

**every inventory log INSERT contains the physical branch**

```text
'routers/branchInventoryItems.js has unscoped stock log SQL'
```

**homepage offers are hidden for anonymous, guest-verified and invalid patient sessions**

```text
|-
    Expected values to be strictly deep-equal:
    + actual - expected
    
    + [
    +   {
    +     branch_id: 1,
    +     discount_type: 'percentage',
    +     discount_value: 20,
    +     eligibility_type: 'all',
    +     featured_order: 0,
    +     id: 5,
    +     is_active: true,
    +     service_ids: [
    +       77
    +     ],
    +     show_on_dashboard: false,
    +     title: 'Patient offer'
    +   }
    + ]
    - []
```

**public news excludes promotional posts and direct promotion requests cannot bypass sign-in**

```text
'expected 200 "OK", got 500 "Internal Server Error"'
```

**registered patients retain promotional news lists and details**

```text
'expected 200 "OK", got 500 "Internal Server Error"'
```

**draft announcement accepts plain-text content**

```text
'URL is not defined'
```

**rejects unsafe external CTA URLs**

```text
|-
    The input did not match the regular expression /internal/i. Input:
    
    'Error: Choose a clinic booking destination from the list.'
```

**rejects protocol-relative redirects**

```text
|-
    The input did not match the regular expression /internal/i. Input:
    
    'Error: Choose a clinic booking destination from the list.'
```

**uses Manila date during UTC previous day and accepts newborns**

```text
|-
    Expected values to be strictly equal:
    + actual - expected
    
    + 'Patients must be at least 18 years old.'
    - null
```

**respects birthday-specific age-100 boundary and does not block infants**

```text
|-
    Expected values to be strictly equal:
    + actual - expected
    
    + 'Patients must be at least 18 years old.'
    - null
```

**billing and all reschedule paths preserve selected promotional discount boundaries**

```text
|-
    The input did not match the regular expression /item\.source_type==='consultation'/. Input:
    
    "const db = require('../db/connect')\r\n" +
      "const { validateSupplyQuantity } = require('./supplyQuantity')\r\n" +
      "const { normalizeText, normalizeOptionalText, normalizeNumber, makeValidationError } = require('./inputValidation')\r\n" +
      '\r\n' +
      'const roundMoney = (value) => Math.round(((Number(value) || 0) + Number.EPSILON) * 100) / 100\r\n' +
      '\r\n' +
      'const getInventoryBaseUnitCost = () => 0\r\n' +
      '\r\n' +
      '// CARAIT no longer treats Inventory Selling Price as acquisition/material cost.\r\n' +
      '// Service pricing is configure
```

**first-login schema, invitation, login, password reset and UI all use the same flag**

```text
|-
    The input did not match the regular expression /\['staff', 'doctor', 'admin'\]/. Input:
    
    "const db = require('../db/connect')\n" +
      "const bcrypt = require('bcrypt')\n" +
      "const { sendPasswordResetOtp } = require('../utils/emailService')\n" +
      "const { normalizePhilippinePhone } = require('../utils/phone')\n" +
      "const { sendPatientPasswordResetOtp } = require('../utils/smsService')\n" +
      "const { validatePassword } = require('../utils/accountSecurity')\n" +
      "const { makeNumericCode, makeRandomToken, hashSecret, timingSafeEqualHash } = require('../utils/securityCrypto')\n" +
      "const { revokeSessions } = require('../utils/sessionSecurity')\n
```

**new additive migration stores draft and published policy separately**

```text
|-
    The expression evaluated to a falsy value:
    
      assert.ok(migrations.includes("'2026-11-01-booking-policy-content.sql'"))
```

**public page is routed, linked from the footer, and opened from the booking flow**

```text
|-
    The expression evaluated to a falsy value:
    
      assert.ok(booking.includes('/booking-policy?branch_id='))
```

**appointment validates the doctor and service inside the requested branch transaction**

```text
|-
    The expression evaluated to a falsy value:
    
      assert.ok(calls.some(([sql,args])=>sql.includes('FROM doctors')&&sql.includes('branch_id=?')&&args[1]===2))
```

**patient booking explicitly requires branch-owned doctor and service**

```text
|-
    The input did not match the regular expression /FROM doctors WHERE id=\? AND is_active=1 AND branch_id=\?/. Input:
    
    "const db = require('../db/connect')\r\n" +
      "const bcrypt = require('bcrypt')\r\n" +
      "const jwt = require('jsonwebtoken')\r\n" +
      "const generateCookie = require('../utils/generateCookie')\r\n" +
      "const { issueSession, verifySessionToken, invalidateRequestSession } = require('../utils/sessionSecurity')\r\n" +
      "const { validatePassword } = require('../utils/accountSecurity')\r\n" +
      "const { makeNumericCode, hashSecret, timingSafeEqualHash } = require('../utils/securityCrypto')\r\n" +
      "const { sendAppointmentStatusEmail } = 
```

**Patient promotion API rejects absent branch and cannot return other branch offers**

```text
|-
    Expected values to be strictly equal:
    
    undefined !== 2
```

**new compatibility endpoints have branch predicates, not JS-only list filtering**

```text
|-
    The input did not match the regular expression /WHERE p\.id=\? AND EXISTS/. Input:
    
    "const { listBranchPatients, getBranchPatientRecord } = require('../utils/patientRecordView')\r\n" +
      "const {afterSuccessfulMutation}=require('../utils/clinicEvents')\r\n" +
      "const {attachBatchesToInventory}=require('../utils/inventoryBatches')\r\n" +
      "const {hydrateBillingCatalogRows}=require('../utils/billing')\r\n" +
      "const {loadSuperAdminReport,SECTIONS}=require('../utils/superAdminReports')\r\n" +
      '// Physical-branch management. Unlike the legacy admin controller, every data\r\n' +
      '// query here contains an explicit authorized physical-branch predicate.
```

**patient doctor schedules require branch-scoped active doctor**

```text
|-
    The input did not match the regular expression /d\.id = \? AND d\.branch_id = \?/. Input:
    
    "const db = require('../db/connect')\r\n" +
      "const bcrypt = require('bcrypt')\r\n" +
      "const jwt = require('jsonwebtoken')\r\n" +
      "const generateCookie = require('../utils/generateCookie')\r\n" +
      "const { issueSession, verifySessionToken, invalidateRequestSession } = require('../utils/sessionSecurity')\r\n" +
      "const { validatePassword } = require('../utils/accountSecurity')\r\n" +
      "const { makeNumericCode, hashSecret, timingSafeEqualHash } = require('../utils/securityCrypto')\r\n" +
      "const { sendAppointmentStatusEmail } = require('../utils/emailSe
```

**queue display unlock refuses an invalid branch**

```text
'Unexpected query: SELECT pin_hash,pin_version,updated_at,updated_by_admin_id FROM branch_queue_display_security WHERE branch_id=? LIMIT 1'
```

**queue display session is HttpOnly, branch-bound, and live queue queries enforce that branch**

```text
'Unexpected query: SELECT pin_hash,pin_version,updated_at,updated_by_admin_id FROM branch_queue_display_security WHERE branch_id=? LIMIT 1'
```

**dashboard and reports separate billed from collected and have date selectors**

```text
|-
    The input did not match the regular expression /Billed Amount/. Input:
    
    "import InventoryPulse from '../InventoryPulse'\n" +
      "import {useEffect,useState} from 'react'\n" +
      "import {NavLink} from 'react-router-dom'\n" +
      "import {MdBusiness,MdCalendarMonth,MdPendingActions,MdPayments,MdCheckCircle,MdPersonOff,MdRefresh,MdArrowForward,MdPeople,MdHistory,MdWarningAmber,MdBlock} from 'react-icons/md'\n" +
      "import {fetchJson,Card,PageHead,StatCard,Pill,Banner,Loading,Empty,pesos,whole,todayISO,beforeISO,SecondaryButton} from './shared'\n" +
      "import {isValidReportPeriod,sumBranchMetric} from './reportFormat'\n" +
      "import {loadOverviewSections} from
```

**Super Admin credits API is protected and never exposes key**

```text
|-
    The input did not match the regular expression /Refresh Balance/. Input:
    
    "import useClinicRefresh from '../../../hooks/useClinicRefresh'\r\n" +
      "import { useEffect, useState } from 'react'\r\n" +
      "import { PageHead, Banner, Card } from './shared'\r\n" +
      '\r\n' +
      "const ENDPOINT = '/api/admin/system-setup/doctor-notifications'\r\n" +
      "const CREDITS_ENDPOINT = '/api/admin/system-setup/sms-credits'\r\n" +
      "const SEMAPHORE_URL = 'https://semaphore.co/'\r\n" +
      'const initial = { send_email: true, send_sms: false }\r\n' +
      'const loadJson = async (options) => {\r\n' +
      '  const response = await fetch(ENDPOINT, {\r\n' +
      "    
```

**branch payment setting and gateway never enable QR Ph automatically**

```text
|-
    The input did not match the regular expression /CARAIT_ENFORCE_QRPH_BRANCH_TOGGLE/. Input:
    
    "'use strict'\r\n" +
      "const express = require('express')\r\n" +
      "const db = require('../db/connect')\r\n" +
      "const { createQr, retrieveIntent, retrieveRefund, cancelIntent, credentials, fail } = require('../utils/paymongoClient')\r\n" +
      "const { assertVerifiedQrRefund } = require('../utils/paymongoRefundVerification')\r\n" +
      "const { verifyPaymongoSignature } = require('../utils/paymongoWebhookSignature')\r\n" +
      "const { getBillingRecordWithItems } = require('../utils/billing')\r\n" +
      "const { writeAuditLog } = require('../utils/audit')\r\n" +
 
```

**branch and Staff System Setup use the same physical stock allocation summary**

```text
|-
    The input did not match the regular expression /getBranchStockRooms\(db, req.branchId\)/. Input:
    
    "const { listBranchPatients } = require('../utils/patientRecordView')\r\n" +
      "const reminderRoutes=require('./appointmentReminderRoutes')\r\n" +
      '// server/routers/staff.router.js\r\n' +
      "const express    = require('express')\r\n" +
      "const db = require('../db/connect')\r\n" +
      "const {listBillingCatalog} = require('../utils/billing')\r\n" +
      "const {validateBookingSettings,normalizeBookingSettings,withBookingTestingCapability}=require('../utils/bookingPolicy')\r\n" +
      "const {cloneDefaultBookingPolicyDocument,normalizeBookingPolicyDocument,pa
```

**walk-in email can register and SMS activation upgrades the same patient without changing visit or financial history**

```text
'Unexpected synthetic registration query: SELECT id FROM patients WHERE LOWER(email) = LOWER(?) LIMIT 1'
```

**registration normalizes case and phone formatting when linking the walk-in record**

```text
'Unexpected synthetic registration query: SELECT id FROM patients WHERE LOWER(email) = LOWER(?) LIMIT 1'
```

**real patient accounts remain protected even when an old is_walk_in flag is still 1**

```text
'Unexpected synthetic registration query: SELECT id FROM patients WHERE LOWER(email) = LOWER(?) LIMIT 1'
```

**an email-only match with a different or missing mobile cannot claim a walk-in history**

```text
'Unexpected synthetic registration query: SELECT id FROM patients WHERE LOWER(email) = LOWER(?) LIMIT 1'
```

**identity mismatches and banned walk-ins do not overwrite the patient record**

```text
'Unexpected synthetic registration query: SELECT id FROM patients WHERE LOWER(email) = LOWER(?) LIMIT 1'
```

**a different registered patient owning the requested email blocks registration**

```text
'Unexpected synthetic registration query: SELECT id FROM patients WHERE LOWER(email) = LOWER(?) LIMIT 1'
```

**invalid and expired OTPs do not activate credentials; five wrong attempts invalidate the code**

```text
'Unexpected synthetic registration query: SELECT id FROM patients WHERE LOWER(email) = LOWER(?) LIMIT 1'
```

**verification rechecks credentials and email ownership changed after sending the OTP**

```text
'Unexpected synthetic registration query: SELECT id FROM patients WHERE LOWER(email) = LOWER(?) LIMIT 1'
```

**activation and OTP consumption roll back if consent, audit or uniqueness checks fail**

```text
'Unexpected synthetic registration query: SELECT id FROM patients WHERE LOWER(email) = LOWER(?) LIMIT 1'
```

**simultaneous verification cannot activate twice or issue a second session**

```text
'Unexpected synthetic registration query: SELECT id FROM patients WHERE LOWER(email) = LOWER(?) LIMIT 1'
```

**a new patient without a matching walk-in still registers normally**

```text
'Unexpected synthetic registration query: SELECT id FROM patients WHERE LOWER(email) = LOWER(?) LIMIT 1'
```

**an unused email may replace the walk-in email only after verified mobile ownership**

```text
'Unexpected synthetic registration query: SELECT id FROM patients WHERE LOWER(email) = LOWER(?) LIMIT 1'
```

**missing legacy demographics can be completed while an unchanged verified email remains verified**

```text
'Unexpected synthetic registration query: SELECT id FROM patients WHERE LOWER(email) = LOWER(?) LIMIT 1'
```

**a patient record introduced after the OTP request cannot silently change the activation target**

```text
'Unexpected synthetic registration query: SELECT id FROM patients WHERE LOWER(email) = LOWER(?) LIMIT 1'
```

</details>

## vitest

Final: {'tests': 259, 'pass': 252, 'fail': 7}. Baseline: {'tests': 263, 'pass': 256, 'fail': 7}.

1. **September 28 Batch 2 — inventory semantics, services setup, and prescription quantity tracks service consumables as generic whole units and adds their Selling Price to the Service Price**
   - `server/tests/security/batch2InventorySemantics.test.js`

2. **September 28 Batch 2 — inventory semantics, services setup, and prescription quantity uses prescription quantity while keeping legacy dosage readable**
   - `server/tests/security/batch2InventorySemantics.test.js`

3. **Batch 5 deferred inventory deduction workflow does not cap actual consumable entry to pre-checked treatment-room stock**
   - `server/tests/security/batch5InventoryWorkflow.test.js`

4. **September 29 Batch 6C — Doctor Account classification cleanup does not write specialty from Admin doctor create/update payloads**
   - `server/tests/security/batch6CDoctorAccounts.test.js`

5. **billing checkout follow-up regressions uses clinic-facing billing statuses and provides a return path to payment**
   - `server/tests/security/billingCheckoutFollowup20260930.test.js`

6. **September 30 consultation workflow UX allows patient-specific substitutions while keeping the booked service, branch inventory and completion lock**
   - `server/tests/security/consultationWorkflowUx20260930.test.js`

7. **Batch 1 recovery and consultation autosave regressions keeps draft saving independent from treatment-room stock and autosaves without a manual Save Draft button**
   - `server/tests/security/recoveryAutosave20260928.test.js`

<details><summary>Failure excerpts</summary>

**September 28 Batch 2 — inventory semantics, services setup, and prescription quantity tracks service consumables as generic whole units and adds their Selling Price to the Service Price**

```text
AssertionError: expected 'import {useAuth} from \'../../context…' to contain 'whole units'
    at D:/Programming IDE_Codes/ALLPROGRAMMING_FILES_CODES/CAPSTONE/server/tests/security/batch2InventorySemantics.test.js:51:20
    at file:///D:/Programming%20IDE_Codes/ALLPROGRAMMING_FILES_CODES/CAPSTONE/server/node_modules/@vitest/runner/dist/chunk-artifact.js:302:11
    at file:///D:/Programming%20IDE_Codes/ALLPROGRAMMING_FILES_CODES/CAPSTONE/server/node_modules/@vitest/runner/dist/chunk-artifact.js:1903:26
    at file:///D:/Programming%20IDE_Codes/ALLPROGRAMMING_FILES_CODES/CAPSTONE/server/node_modules/@vitest/runner/dist/chunk-artifact.js:2326:20
    at new Promise (<anonymous>)
    at runWithCa
```

**September 28 Batch 2 — inventory semantics, services setup, and prescription quantity uses prescription quantity while keeping legacy dosage readable**

```text
AssertionError: expected 'import FinancialBillBreakdown from \'…' to contain 'rx.quantity ?? rx.dosage'
    at D:/Programming IDE_Codes/ALLPROGRAMMING_FILES_CODES/CAPSTONE/server/tests/security/batch2InventorySemantics.test.js:99:28
    at file:///D:/Programming%20IDE_Codes/ALLPROGRAMMING_FILES_CODES/CAPSTONE/server/node_modules/@vitest/runner/dist/chunk-artifact.js:302:11
    at file:///D:/Programming%20IDE_Codes/ALLPROGRAMMING_FILES_CODES/CAPSTONE/server/node_modules/@vitest/runner/dist/chunk-artifact.js:1903:26
    at file:///D:/Programming%20IDE_Codes/ALLPROGRAMMING_FILES_CODES/CAPSTONE/server/node_modules/@vitest/runner/dist/chunk-artifact.js:2326:20
    at new Promise (<anonymous>)
   
```

**Batch 5 deferred inventory deduction workflow does not cap actual consumable entry to pre-checked treatment-room stock**

```text
AssertionError: expected 'import RecommendedFollowupEditor from…' to contain 'Actual service supplies and any Extra…'
    at D:/Programming IDE_Codes/ALLPROGRAMMING_FILES_CODES/CAPSTONE/server/tests/security/batch5InventoryWorkflow.test.js:57:26
    at file:///D:/Programming%20IDE_Codes/ALLPROGRAMMING_FILES_CODES/CAPSTONE/server/node_modules/@vitest/runner/dist/chunk-artifact.js:302:11
    at file:///D:/Programming%20IDE_Codes/ALLPROGRAMMING_FILES_CODES/CAPSTONE/server/node_modules/@vitest/runner/dist/chunk-artifact.js:1903:26
    at file:///D:/Programming%20IDE_Codes/ALLPROGRAMMING_FILES_CODES/CAPSTONE/server/node_modules/@vitest/runner/dist/chunk-artifact.js:2326:20
    at new Promise (<an
```

**September 29 Batch 6C — Doctor Account classification cleanup does not write specialty from Admin doctor create/update payloads**

```text
AssertionError: expected 'const { writeInventoryActivity, readP…' to contain 'const { full_name, email, phone, clin…'
    at D:/Programming IDE_Codes/ALLPROGRAMMING_FILES_CODES/CAPSTONE/server/tests/security/batch6CDoctorAccounts.test.js:27:20
    at file:///D:/Programming%20IDE_Codes/ALLPROGRAMMING_FILES_CODES/CAPSTONE/server/node_modules/@vitest/runner/dist/chunk-artifact.js:302:11
    at file:///D:/Programming%20IDE_Codes/ALLPROGRAMMING_FILES_CODES/CAPSTONE/server/node_modules/@vitest/runner/dist/chunk-artifact.js:1903:26
    at file:///D:/Programming%20IDE_Codes/ALLPROGRAMMING_FILES_CODES/CAPSTONE/server/node_modules/@vitest/runner/dist/chunk-artifact.js:2326:20
    at new Promise (<anon
```

**billing checkout follow-up regressions uses clinic-facing billing statuses and provides a return path to payment**

```text
AssertionError: expected 'import { useCallback, useEffect, useM…' to contain 'Open Bill'
    at D:/Programming IDE_Codes/ALLPROGRAMMING_FILES_CODES/CAPSTONE/server/tests/security/billingCheckoutFollowup20260930.test.js:17:18
    at file:///D:/Programming%20IDE_Codes/ALLPROGRAMMING_FILES_CODES/CAPSTONE/server/node_modules/@vitest/runner/dist/chunk-artifact.js:302:11
    at file:///D:/Programming%20IDE_Codes/ALLPROGRAMMING_FILES_CODES/CAPSTONE/server/node_modules/@vitest/runner/dist/chunk-artifact.js:1903:26
    at file:///D:/Programming%20IDE_Codes/ALLPROGRAMMING_FILES_CODES/CAPSTONE/server/node_modules/@vitest/runner/dist/chunk-artifact.js:2326:20
    at new Promise (<anonymous>)
    at runW
```

**September 30 consultation workflow UX allows patient-specific substitutions while keeping the booked service, branch inventory and completion lock**

```text
AssertionError: expected 'import RecommendedFollowupEditor from…' to contain 'Supplies Actually Used'
    at D:/Programming IDE_Codes/ALLPROGRAMMING_FILES_CODES/CAPSTONE/server/tests/security/consultationWorkflowUx20260930.test.js:24:26
    at file:///D:/Programming%20IDE_Codes/ALLPROGRAMMING_FILES_CODES/CAPSTONE/server/node_modules/@vitest/runner/dist/chunk-artifact.js:302:11
    at file:///D:/Programming%20IDE_Codes/ALLPROGRAMMING_FILES_CODES/CAPSTONE/server/node_modules/@vitest/runner/dist/chunk-artifact.js:1903:26
    at file:///D:/Programming%20IDE_Codes/ALLPROGRAMMING_FILES_CODES/CAPSTONE/server/node_modules/@vitest/runner/dist/chunk-artifact.js:2326:20
    at new Promise (<anonymous>)
```

**Batch 1 recovery and consultation autosave regressions keeps draft saving independent from treatment-room stock and autosaves without a manual Save Draft button**

```text
AssertionError: expected 'import RecommendedFollowupEditor from…' to contain 'Actual service supplies and any Extra…'
    at D:/Programming IDE_Codes/ALLPROGRAMMING_FILES_CODES/CAPSTONE/server/tests/security/recoveryAutosave20260928.test.js:55:26
    at file:///D:/Programming%20IDE_Codes/ALLPROGRAMMING_FILES_CODES/CAPSTONE/server/node_modules/@vitest/runner/dist/chunk-artifact.js:302:11
    at file:///D:/Programming%20IDE_Codes/ALLPROGRAMMING_FILES_CODES/CAPSTONE/server/node_modules/@vitest/runner/dist/chunk-artifact.js:1903:26
    at file:///D:/Programming%20IDE_Codes/ALLPROGRAMMING_FILES_CODES/CAPSTONE/server/node_modules/@vitest/runner/dist/chunk-artifact.js:2326:20
    at new Promise (<a
```

</details>
