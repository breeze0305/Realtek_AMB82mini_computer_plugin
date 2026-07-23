import { Wifi, WifiOff } from "lucide-react";

type NetworkStatusProps = {
  floating?: boolean;
  internetConnected: boolean;
  t: Record<string, string>;
};

export function NetworkStatus({ floating = false, internetConnected, t }: NetworkStatusProps) {
  return (
    <div className={`networkStatus ${internetConnected ? "online" : "offline"} ${floating ? "isFloating" : ""}`}>
      {internetConnected ? <Wifi size={17} /> : <WifiOff size={17} />}
      {internetConnected ? t.online : t.offline}
    </div>
  );
}
