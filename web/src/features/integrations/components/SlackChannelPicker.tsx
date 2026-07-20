import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSlackChannels } from "../hooks/useSlackChannels";
import { Loader2 } from "lucide-react";

interface SlackChannelPickerProps {
  value: string;
  onChange: (value: string, name: string) => void;
  disabled?: boolean;
}

export function SlackChannelPicker({ value, onChange, disabled }: SlackChannelPickerProps) {
  const { data: channels, isLoading, error } = useSlackChannels(!disabled);

  if (isLoading) {
    return (
      <div className="flex items-center space-x-2 text-sm text-muted-foreground p-2 border rounded-md">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading channels...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-destructive p-2 border border-destructive/50 rounded-md">
        Failed to load channels
      </div>
    );
  }

  return (
    <Select
      value={value}
      onValueChange={(val) => {
        const channel = channels?.find((c) => c.id === val);
        if (channel) {
          onChange(val, channel.name);
        }
      }}
      disabled={disabled || !channels?.length}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select a channel..." />
      </SelectTrigger>
      <SelectContent>
        {channels?.map((channel) => (
          <SelectItem key={channel.id} value={channel.id}>
            {channel.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
