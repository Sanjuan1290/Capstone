import { Link } from 'react-router-dom'
import usePageMeta from '../hooks/usePageMeta'

const NotFound = () => {
  usePageMeta({ title: 'Page not found | D&C Prime Realty', description: 'The requested page could not be found.' })

  return (
    <section className="dc-not-found" aria-labelledby="dc-not-found-title">
      <img
        src="/website/images/brand/dc-prime-mark.svg"
        className="dc-not-found-mark"
        alt=""
        aria-hidden="true"
        width="80"
        height="80"
      />
      <p className="dc-not-found-code">404</p>
      <h1 id="dc-not-found-title">Page not found</h1>
      <p className="dc-not-found-description">The page may have moved or the address may be incorrect.</p>
      <Link to="/" className="website-button-dark dc-not-found-action">Return home</Link>
    </section>
  )
}

export default NotFound
