export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="site-footer">
      <span>RapidFire AutoCare, Inc.</span>
      <span>© {year}</span>
    </footer>
  )
}
