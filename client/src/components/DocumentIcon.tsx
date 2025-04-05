import { FileText, FileImage, File } from "lucide-react";

type SupportedFileType = 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' | 'text/plain' | 'text/html' | 'text/markdown' | string;

interface DocumentIconProps {
  fileType: SupportedFileType;
  size?: number;
  className?: string;
}

export const DocumentIcon = ({ fileType, size = 16, className = "" }: DocumentIconProps) => {
  // Determine which icon to show based on file type
  const getIcon = () => {
    if (fileType === 'application/pdf') {
      return <File size={size} className={className} />;
    } else if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return <FileText size={size} className={className} />;
    } else if (fileType.startsWith('text/')) {
      return <FileText size={size} className={className} />;
    } else if (fileType.startsWith('image/')) {
      return <FileImage size={size} className={className} />;
    } else {
      return <File size={size} className={className} />;
    }
  };

  return getIcon();
};