import {
  classContainsString,
  forEachClass,
  hasMethodNames,
  injectIntoConstructor,
} from "../ast-helpers";
import { LibraryMod } from "../mods";

export const GOOGLEMAPS_MOD: LibraryMod = {
  keyword: "google.maps",
  mutate: (ast) => {
    forEachClass(ast, (classNode) => {
      if (isAdvancedMarkerElement(classNode)) {
        console.log("found advanced marker element");

        injectIntoConstructor(classNode, (self: any, options: any) => {
          self.__PIN_MARKER_ID__ = crypto.randomUUID().replace(/-/g, "");

          const position = options?.position;

          if (!position) {
            return;
          }

          document.dispatchEvent(
            new CustomEvent("pin:message", {
              detail: {
                action: "update",
                objectId: self.__PIN_MARKER_ID__,
                type: "Marker",
                data: {
                  position,
                },
              },
            })
          );
        });
      }
    });
  },
};

/**
 * Detect AdvancedMarkerElement class using multiple signals:
 * - Web Component lifecycle methods (connectedCallback, disconnectedCallback)
 * - Google Maps specific methods (addListener)
 * - Marker-specific properties (position, map)
 * - GMP-specific properties unique to AdvancedMarkerElement (gmpDraggable, gmpClickable)
 * - String literal "AdvancedMarkerElement" in constructor
 */
const isAdvancedMarkerElement = (classNode: any): boolean => {
  // Must have Google Maps event method
  return (
    hasMethodNames(classNode, [
      "connectedCallback",
      "addListener",
      "position",
      "gmpDraggable",
      "gmpClickable",
      "collisionBehavior",
    ]) && classContainsString(classNode, "AdvancedMarkerElement")
  );
};
