import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function MarketTrend() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const category = searchParams.get('category');

  useEffect(() => {
    if (category) {
      navigate(`/dashboard?category=${encodeURIComponent(category)}&tab=market`, { replace: true });
    } else {
      navigate('/', { replace: true });
    }
  }, [category, navigate]);

  return null;
}
