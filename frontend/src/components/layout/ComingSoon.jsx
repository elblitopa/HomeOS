import TopBar from "./TopBar.jsx";
import GlassCard from "../ui/GlassCard.jsx";

export default function ComingSoon({ title }) {
  return (
    <div className="p-4 md:p-8">
      <TopBar title={title} />
      <GlassCard className="flex flex-col items-center gap-2 p-12 text-center">
        <span className="text-4xl">🛠️</span>
        <p className="font-medium">Este módulo llegará en una fase futura.</p>
        <p className="text-sm text-ink-soft">
          Por ahora, el launcher de Apps es el corazón de HomeOS.
        </p>
      </GlassCard>
    </div>
  );
}
