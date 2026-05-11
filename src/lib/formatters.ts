import { format } from "date-fns";

export function formatServiceType(serviceType: string | null): string {
  if (!serviceType) return "Not Assigned";

  switch (serviceType) {
    case "consultation":
      return "One-Time Nutrition Consultation";
    case "hundred_days":
      return "100-Days Nutrition Program";
    default:
      return serviceType;
  }
}

export function formatProgramType(programType: string | null): string {
  if (!programType) return "Not Set";

  return programType
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function getServiceTypeBadgeColor(serviceType: string | null): string {
  switch (serviceType) {
    case "consultation":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "hundred_days":
      return "bg-blue-100 text-blue-800 border-blue-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
}

export function formatDateTime(date: string | Date | null): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "dd/MM/yyyy • hh:mm a");
}

export function formatDate(date: string | Date | null): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "dd/MM/yyyy");
}
