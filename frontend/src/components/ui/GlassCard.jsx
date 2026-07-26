export default function GlassCard({ banner, className = "", children, ...rest }) {
  return (
    <div className={`glass overflow-hidden ${className}`} {...rest}>
      {banner && (
        <div
          className="h-24 w-full bg-cover bg-center"
          style={{ backgroundImage: `url(${banner})` }}
        />
      )}
      {children}
    </div>
  );
}
