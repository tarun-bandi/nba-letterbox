import { View } from "react-native";

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function PageContainer({ children, className = "" }: PageContainerProps) {
  return (
    <View className={`w-full max-w-screen-md self-center ${className}`}>
      {children}
    </View>
  );
}
