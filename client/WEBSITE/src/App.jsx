import { Suspense, lazy } from 'react'
import { createBrowserRouter, RouterProvider, Route, createRoutesFromElements } from 'react-router-dom'
import WebsiteLayout from './website/layouts/WebsiteLayout.jsx'
import { ProjectPreferencesProvider } from './website/context/ProjectPreferencesContext.jsx'
import './website/styles/website.css'
import './website/styles/website-utilities.css'
const AboutUs = lazy(() => import('./website/pages/AboutUs.jsx'))
const Blog = lazy(() => import('./website/pages/Blog.jsx'))
const BlogDetails = lazy(() => import('./website/pages/BlogDetails.jsx'))
const BookTripping = lazy(() => import('./website/pages/BookTripping.jsx'))
const ContactUs = lazy(() => import('./website/pages/ContactUs.jsx'))
const Disclaimer = lazy(() => import('./website/pages/Disclaimer.jsx'))
const FAQs = lazy(() => import('./website/pages/FAQs.jsx'))
const Home = lazy(() => import('./website/pages/Home.jsx'))
const NotFound = lazy(() => import('./website/pages/NotFound.jsx'))
const Opportunities = lazy(() => import('./website/pages/Opportunities.jsx'))
const PaymentEstimator = lazy(() => import('./website/pages/PaymentEstimator.jsx'))
const PrivacyNotice = lazy(() => import('./website/pages/PrivacyNotice.jsx'))
const Properties = lazy(() => import('./website/pages/Properties.jsx'))
const PropertyDetails = lazy(() => import('./website/pages/PropertyDetails.jsx'))
const SavedProjects = lazy(() => import('./website/pages/SavedProjects.jsx'))
const Sellers = lazy(() => import('./website/pages/Sellers.jsx'))
const SiteCoordinator = lazy(() => import('./website/pages/SiteCoordinator.jsx'))
const TermsOfUse = lazy(() => import('./website/pages/TermsOfUse.jsx'))
const VisitChecklistPage = lazy(() => import('./website/pages/VisitChecklistPage.jsx'))
const router = createBrowserRouter(createRoutesFromElements(
  <Route path="/" element={<WebsiteLayout />}>
        <Route index element={<Home />} />
        <Route path="about-us" element={<AboutUs />} />
        <Route path="properties" element={<Properties />} />
        <Route path="properties/:projectSlug" element={<PropertyDetails />} />
        <Route path="blog" element={<Blog />} />
        <Route path="blog/:blogSlug" element={<BlogDetails />} />
        <Route path="faqs" element={<FAQs />} />
        <Route path="site-coordinator" element={<SiteCoordinator />} />
        <Route path="sellers" element={<Sellers />} />
        <Route path="contact-us" element={<ContactUs />} />
        <Route path="opportunities" element={<Opportunities />} />
        <Route path="book-tripping" element={<BookTripping />} />
        <Route path="saved-projects" element={<SavedProjects />} />
        <Route path="visit-checklist" element={<VisitChecklistPage />} />
        <Route path="payment-estimator" element={<PaymentEstimator />} />
        <Route path="privacy-policy" element={<PrivacyNotice />} />
        <Route path="terms-of-use" element={<TermsOfUse />} />
        <Route path="disclaimer" element={<Disclaimer />} />
        <Route path="*" element={<NotFound />} />
  </Route>
))
export default function App() {
  return <ProjectPreferencesProvider><Suspense fallback={<main role="status">Loading website...</main>}><RouterProvider router={router} /></Suspense></ProjectPreferencesProvider>
}

