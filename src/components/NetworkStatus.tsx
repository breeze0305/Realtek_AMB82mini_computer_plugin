import { Wifi, WifiOff } from "lucide-react";

type NetworkStatusProps = {
  internetConnected: boolean;
  t: Record<string, string>;
};

export function NetworkStatus({ internetConnected, t }: NetworkStatusProps) {
  return (
    <div className={internetConnected ? "networkStatus online" : "networkStatus offline"}>
      {internetConnected ? <Wifi size={17} /> : <WifiOff size={17} />}
      {internetConnected ? t.online : t.offline}
    </div>
  );
}
