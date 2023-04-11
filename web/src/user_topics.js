import render_topic_muted from "../templates/topic_muted.hbs";

import * as blueslip from "./blueslip";
import * as channel from "./channel";
import * as feedback_widget from "./feedback_widget";
import {FoldDict} from "./fold_dict";
import {$t} from "./i18n";
import {page_params} from "./page_params";
import * as stream_data from "./stream_data";
import * as timerender from "./timerender";
import {get_time_from_date_muted} from "./util";

const muted_topics = new Map();

export const all_visibility_policies = {
    INHERIT: 0,
    MUTED: 1,
    UNMUTED: 2,
    FOLLOWED: 3,
};

export function add_muted_topic(stream_id, topic, date_muted) {
    let sub_dict = muted_topics.get(stream_id);
    if (!sub_dict) {
        sub_dict = new FoldDict();
        muted_topics.set(stream_id, sub_dict);
    }
    const time = get_time_from_date_muted(date_muted);
    sub_dict.set(topic, time);
}

export function remove_muted_topic(stream_id, topic) {
    const sub_dict = muted_topics.get(stream_id);
    if (sub_dict) {
        sub_dict.delete(topic);
    }
}

export function is_topic_muted(stream_id, topic) {
    if (stream_id === undefined) {
        return false;
    }
    const sub_dict = muted_topics.get(stream_id);
    return (sub_dict && sub_dict.get(topic)) || false;
}

export function get_muted_topics() {
    const topics = [];
    for (const [stream_id, sub_dict] of muted_topics) {
        const stream = stream_data.maybe_get_stream_name(stream_id);
        for (const topic of sub_dict.keys()) {
            const date_muted = sub_dict.get(topic);
            const date_muted_str = timerender.render_now(new Date(date_muted)).time_str;
            topics.push({
                stream_id,
                stream,
                topic,
                date_muted,
                date_muted_str,
            });
        }
    }
    return topics;
}

export function set_user_topic_visibility_policy(stream_id, topic, visibility_policy, from_hotkey) {
    const data = {
        stream_id,
        topic,
        visibility_policy,
    };

    channel.post({
        url: "/json/user_topics",
        data,
        success() {
            if (visibility_policy === all_visibility_policies.INHERIT) {
                feedback_widget.dismiss();
                return;
            }
            if (!from_hotkey) {
                return;
            }

            // The following feedback_widget notice helps avoid
            // confusion when a user who is not familiar with Zulip's
            // keyboard UI hits "M" in the wrong context and has a
            // bunch of messages suddenly disappear. This notice is
            // only useful when muting from the keyboard, since you
            // know what you did if you triggered muting with the
            // mouse.
            const stream_name = stream_data.maybe_get_stream_name(stream_id);
            feedback_widget.show({
                populate($container) {
                    const rendered_html = render_topic_muted();
                    $container.html(rendered_html);
                    $container.find(".stream").text(stream_name);
                    $container.find(".topic").text(topic);
                },
                on_undo() {
                    set_user_topic_visibility_policy(
                        stream_id,
                        topic,
                        all_visibility_policies.INHERIT,
                    );
                },
                title_text: $t({defaultMessage: "Topic muted"}),
                undo_button_text: $t({defaultMessage: "Undo mute"}),
            });
        },
    });
}

export function set_user_topic(user_topic) {
    const stream_id = user_topic.stream_id;
    const topic = user_topic.topic_name;
    const date_muted = user_topic.last_updated;

    const stream_name = stream_data.maybe_get_stream_name(stream_id);

    if (!stream_name) {
        blueslip.warn("Unknown stream ID in set_user_topic: " + stream_id);
        return;
    }

    switch (user_topic.visibility_policy) {
        case visibility_policy.MUTED:
            add_muted_topic(stream_id, topic, date_muted);
            break;
        case visibility_policy.INHERIT:
            remove_muted_topic(stream_id, topic);
            break;
    }
}

export function set_user_topics(user_topics) {
    muted_topics.clear();

    for (const user_topic of user_topics) {
        set_user_topic(user_topic);
    }
}

export function initialize() {
    set_user_topics(page_params.user_topics);
}
