import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  title: string;
  value: string | number | React.ReactNode; // ← Modifié ici
  description?: string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    type: 'positive' | 'negative' | 'neutral';
  };
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  description,
  icon,
  trend,
  className
}) => {
  return (
    <Card className={cn("card-gradient border-border/50 hover:shadow-md transition-all duration-200", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {icon && (
          <div className="h-8 w-8 text-muted-foreground">
            {icon}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline justify-between">
          <div className="text-2xl font-bold">{value}</div> {/* ← Ici value peut maintenant être un ReactNode */}
          {trend && (
            <Badge 
              variant={trend.type === 'positive' ? 'default' : trend.type === 'negative' ? 'destructive' : 'secondary'}
              className="ml-2"
            >
              {trend.type === 'positive' ? '+' : trend.type === 'negative' ? '-' : ''}
              {Math.abs(trend.value)}%
            </Badge>
          )}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">
            {description}
          </p>
        )}
      </CardContent>
    </Card>
  );
};