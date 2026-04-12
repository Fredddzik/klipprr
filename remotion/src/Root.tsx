import type { FC } from "react";
import { Composition } from "remotion";
import { KlipprrVertical } from "./compositions/KlipprrVertical";

export const RemotionRoot: FC = () => {
  return (
    <>
      <Composition
        id="KlipprrVertical"
        component={KlipprrVertical}
        durationInFrames={600}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          tagline: "Clip any video. Export in seconds.",
          cta: "Get Klipprr",
        }}
      />
    </>
  );
};
