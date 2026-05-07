import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }: EmptyStateProps) {
  return (
    <div className="card text-center py-12">
      <Icon className="h-10 w-10 text-kpmg-gray-300 mx-auto mb-3" />
      <h3 className="font-semibold text-kpmg-gray-700">{title}</h3>
      {description && <p className="text-sm text-kpmg-gray-500 mt-1 mb-4">{description}</p>}
      {action}
    </div>
  );
}
