import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  backTo?: string;
  backLabel?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, backTo, backLabel = "Back", actions }: PageHeaderProps) {
  return (
    <div className="space-y-2">
      {backTo && (
        <Link
          to={backTo}
          className="text-sm text-kpmg-blue hover:text-kpmg-purple inline-flex items-center"
        >
          <ChevronLeft className="h-4 w-4" />
          {backLabel}
        </Link>
      )}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-kpmg-gray-800">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-kpmg-gray-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
