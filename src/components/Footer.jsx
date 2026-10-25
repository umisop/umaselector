const FOOTER_LINKS = [
  { href: '/about', label: 'About' },
  { href: '/faq', label: 'FAQ' },
  { href: '/feedback', label: 'Feedback' },
  { href: '/privacy-policy', label: 'Privacy Policy' },
  { href: '/cookie-settings', label: 'Cookie settings' },
  { href: '/terms', label: 'Terms of Use' },
  { href: '/contact', label: 'Contact' },
];

export default function Footer() {
  return (
    <footer className="site-footer site-footer-rich">
      <nav className="site-footer-links" aria-label="Footer navigation">
        {FOOTER_LINKS.map((link) => (
          <a href={link.href} key={link.href}>{link.label}</a>
        ))}
      </nav>
      <div className="site-footer-disclaimer">
        <span>Not affiliated with Cygames or Uma Musume Pretty Derby.</span>
        <span>© {new Date().getFullYear()} Card Exchange Selector · Fan-made community tool</span>
      </div>
    </footer>
  );
}
