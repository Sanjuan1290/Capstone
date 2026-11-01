const AuthCheckFallback = ({ onRetry }) => (
  <div className="flex min-h-[50vh] items-center justify-center p-6">
    <section className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-6 shadow-sm" role="alert">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-lg font-bold text-amber-700" aria-hidden="true">!</div>
      <h1 className="text-lg font-bold text-slate-900">We couldn't verify your sign-in</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        The clinic server did not confirm your session. We have not cleared your sign-in. Check your connection, then try again.
      </p>
      <button
        type="button"
        onClick={() => onRetry?.()}
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
      >
        Try again
      </button>
    </section>
  </div>
)

export default AuthCheckFallback
