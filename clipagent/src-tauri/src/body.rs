//! Response bodies for the :4000 server.
//!
//! hyper 1 has no built-in body type. This gives http.rs the four kinds it uses: empty,
//! whole, streamed from something that yields bytes, and fed by a task through a channel
//! (the preview cache, which writes to disk while it answers).

use std::io;

use bytes::Bytes;
use futures_util::{Stream, TryStreamExt};
use http_body_util::{combinators::UnsyncBoxBody, BodyExt, Empty, Full, StreamBody};
use hyper::body::Frame;
use tokio::sync::mpsc;

pub type Body = UnsyncBoxBody<Bytes, io::Error>;

pub fn empty() -> Body {
    Empty::<Bytes>::new().map_err(|never| match never {}).boxed_unsync()
}

pub fn full(data: impl Into<Bytes>) -> Body {
    Full::new(data.into()).map_err(|never| match never {}).boxed_unsync()
}

pub fn stream<S, E>(s: S) -> Body
where
    S: Stream<Item = Result<Bytes, E>> + Send + 'static,
    E: std::fmt::Display + Send + 'static,
{
    let frames = s
        .map_ok(Frame::data)
        .map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()));
    BodyExt::boxed_unsync(StreamBody::new(frames))
}

/// The sending half of `channel()`.
pub struct Sender(mpsc::Sender<Result<Frame<Bytes>, io::Error>>);

impl Sender {
    /// Errs when the client has gone away.
    pub async fn send_data(&mut self, data: Bytes) -> Result<(), ()> {
        self.0.send(Ok(Frame::data(data))).await.map_err(|_| ())
    }

    /// Ends the body with an error, so the client sees a broken response rather than a
    /// short one that looks complete.
    pub fn abort(self) {
        let _ = self.0.try_send(Err(io::Error::new(io::ErrorKind::Other, "aborted")));
    }
}

pub fn channel() -> (Sender, Body) {
    let (tx, rx) = mpsc::channel::<Result<Frame<Bytes>, io::Error>>(8);
    let frames = futures_util::stream::unfold(rx, |mut rx| async move {
        rx.recv().await.map(|item| (item, rx))
    });
    (Sender(tx), BodyExt::boxed_unsync(StreamBody::new(frames)))
}
