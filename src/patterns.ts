// import { LngLat, MarkerOptions, MapOptions, Map, LngLatLike } from "maplibre-gl";

// Pattern configuration for library interception

export type InjectionPoint = {
  target: string; // "constructor" or method name
  expression: (...args: any[]) => void; // Function to inject
};

export type ClassPattern = {
  name: string; // Descriptive name for logging
  requiredMethods: string[]; // Method names that must be present
  injections: InjectionPoint[];
};

export type LibraryPattern = {
  keyword: string; // Keyword to search for in script files
  classes: ClassPattern[];
};

// Define patterns for libraries to intercept
export const LIBRARY_PATTERNS: LibraryPattern[] = [
  {
    keyword: "maplibre",
    classes: [
      {
        name: "Map",
        requiredMethods: ["addControl", "removeControl", "addSource", "addLayer"],
        injections: [
          {
            target: "constructor",
            expression: (options: any) => {
              console.log("!! Map created", options);
            },
          },
        ],
      },
      {
        name: "Marker",
        requiredMethods: ["setLngLat", "addTo", "remove"],
        injections: [
          {
            target: "constructor",
            expression: (options: any) => {
              if (options.latLng) {
                console.log("!! Marker created", options.latLng.lng, options.latLng.lat);
              } else {
                console.log("!! Marker created", options);
              }
            },
          },
          {
            target: "addTo",
            expression: (map: any) => {
              console.log("!! Marker.addTo called", map);
            },
          },
          {
            target: "setLngLat",
            expression: (lngLatLike) => {
              let lng, lat;

              if (Array.isArray(lngLatLike)) {
                lng = lngLatLike[0];
                lat = lngLatLike[1];
              } else {
                lng = lngLatLike.lng;
                lat = lngLatLike.lat;
              }

              console.log("!! Marker.setLngLat called", lng, lat);
            },
          },
        ],
      },
    ],
  },
];
