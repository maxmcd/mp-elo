interface RouteType {
    id: number;
    type: 'Route';
    title: string;
    rating: number;
    summary: string;
    difficulty: string;
    pitches: number;
    route_types: string[];
  }

  interface ApiResponse {
    id: number;
    title: string;
    children: {
      id: number;
      type: string;
      title: string;
      rating: number;
      summary?: string;
      difficulty?: string;
      pitches?: number;
      route_types?: string[];
      child_areas_count?: number;
    }[];
  }

  const API_BASE = 'https://www.mountainproject.com/api/v2/areas';

  async function fetchArea(areaId: number): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/${areaId}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: ApiResponse = await response.json();

      for (const child of data.children) {
        if (child.type === 'Route') {
          // Log route immediately
          console.log(JSON.stringify({
            id: child.id,
            type: 'Route',
            title: child.title,
            rating: child.rating,
            summary: child.summary || '',
            difficulty: child.difficulty || '',
            pitches: child.pitches || 0,
            route_types: child.route_types || [],
            area: areaId
          }));
        } else if (child.type === 'Area') {
          // Recursively fetch child areas
          await fetchArea(child.id);
        }
      }
    } catch (error) {
      console.error(`Error fetching area ${areaId}:`, error);
    }
  }

const startingAreaId = 105841134; // Red River Gorge
await fetchArea(startingAreaId);
