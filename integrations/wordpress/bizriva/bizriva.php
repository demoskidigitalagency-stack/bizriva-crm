<?php
/**
 * Plugin Name: Bizriva
 * Description: Sends every form entry (Contact Form 7, WPForms, Gravity Forms, Elementor Pro, Fluent Forms) and every WooCommerce order to your Bizriva CRM — no webhook set-up per form.
 * Version: 1.0.0
 * Author: Bizriva
 * License: GPLv2 or later
 * Requires PHP: 7.4
 */
if (!defined('ABSPATH')) exit;

final class Bizriva_Connector {
  const OPT = 'bizriva_settings';

  public static function init() {
    add_action('admin_menu', [__CLASS__, 'menu']);
    add_action('admin_init', [__CLASS__, 'register']);
    // Forms
    add_action('wpcf7_mail_sent', [__CLASS__, 'cf7']);
    add_action('wpforms_process_complete', [__CLASS__, 'wpforms'], 10, 4);
    add_action('gform_after_submission', [__CLASS__, 'gravity'], 10, 2);
    add_action('elementor_pro/forms/new_record', [__CLASS__, 'elementor'], 10, 2);
    add_action('fluentform/submission_inserted', [__CLASS__, 'fluent'], 10, 3);
    add_action('fluentform_submission_inserted', [__CLASS__, 'fluent'], 10, 3);
    // WooCommerce
    add_action('woocommerce_checkout_order_processed', [__CLASS__, 'woo'], 20, 1);
    add_action('woocommerce_store_api_checkout_order_processed', [__CLASS__, 'woo_obj'], 20, 1);
  }

  public static function s($k) { $o = get_option(self::OPT, []); return isset($o[$k]) ? $o[$k] : ''; }

  /** Turn any field list into the plain fields Bizriva understands (name, phone, email, address, city, product, quantity, total, note). */
  public static function guess(array $fields, $source) {
    $out = ['note' => [], 'utm_source' => $source];
    foreach ($fields as $label => $value) {
      if (is_array($value)) $value = implode(', ', array_filter(array_map('strval', $value)));
      $value = trim(wp_strip_all_tags((string) $value));
      if ($value === '') continue;
      $l = strtolower((string) $label);
      $k = null;
      if (preg_match('/phone|tel|mobile|whatsapp|number/', $l)) $k = 'phone';
      elseif (preg_match('/e-?mail/', $l)) $k = 'email';
      elseif (preg_match('/first.?name/', $l)) $k = 'first_name';
      elseif (preg_match('/last.?name|surname/', $l)) $k = 'last_name';
      elseif (preg_match('/name/', $l)) $k = 'name';
      elseif (preg_match('/address|street/', $l)) $k = 'address';
      elseif (preg_match('/city|town|state|region|location/', $l)) $k = 'city';
      elseif (preg_match('/product|item|package|service/', $l)) $k = 'product';
      elseif (preg_match('/qty|quantity/', $l)) $k = 'quantity';
      if ($k && empty($out[$k])) $out[$k] = $value; else $out['note'][] = $label . ': ' . $value;
    }
    if (empty($out['name']) && (!empty($out['first_name']) || !empty($out['last_name']))) $out['name'] = trim(($out['first_name'] ?? '') . ' ' . ($out['last_name'] ?? ''));
    $out['note'] = implode("\n", array_slice($out['note'], 0, 30));
    return $out;
  }

  public static function send(array $payload) {
    $url = trim(self::s('url')); $key = trim(self::s('key'));
    if (!$url || !$key) return;
    wp_remote_post($url, [
      'timeout' => 8, 'blocking' => false,
      'headers' => ['Content-Type' => 'application/json', 'X-Bizriva-Key' => $key],
      'body' => wp_json_encode($payload),
    ]);
  }

  // ---- forms ----
  public static function cf7($form) {
    if (!class_exists('WPCF7_Submission')) return;
    $sub = WPCF7_Submission::get_instance(); if (!$sub) return;
    $data = $sub->get_posted_data();
    foreach (array_keys($data) as $k) if (strpos($k, '_wpcf7') === 0) unset($data[$k]);
    self::send(self::guess($data, 'Contact Form 7: ' . $form->title()));
  }
  public static function wpforms($fields, $entry, $form, $entry_id) {
    $f = []; foreach ((array) $fields as $x) $f[$x['name'] ?? ('field ' . ($x['id'] ?? ''))] = $x['value'] ?? '';
    self::send(self::guess($f, 'WPForms: ' . ($form['settings']['form_title'] ?? 'form')));
  }
  public static function gravity($entry, $form) {
    $f = [];
    foreach ((array) ($form['fields'] ?? []) as $field) {
      $id = is_object($field) ? $field->id : $field['id']; $label = is_object($field) ? $field->label : $field['label'];
      $v = rgar($entry, (string) $id);
      if ($v === '' || $v === null) { $parts = []; foreach ($entry as $k => $val) if (strpos((string) $k, $id . '.') === 0 && $val !== '') $parts[] = $val; $v = implode(' ', $parts); }
      $f[$label] = $v;
    }
    self::send(self::guess($f, 'Gravity Forms: ' . ($form['title'] ?? 'form')));
  }
  public static function elementor($record, $handler) {
    $f = []; foreach ((array) $record->get('fields') as $id => $x) $f[$x['title'] ?: $id] = $x['value'] ?? '';
    self::send(self::guess($f, 'Elementor: ' . $record->get_form_settings('form_name')));
  }
  public static function fluent($entryId, $formData, $form) {
    $data = (array) $formData; unset($data['_wp_http_referer'], $data['__fluent_form_embded_post_id']);
    foreach (array_keys($data) as $k) if (strpos($k, '_fluentform_') === 0) unset($data[$k]);
    if (isset($data['names']) && is_array($data['names'])) { $data['name'] = trim(implode(' ', $data['names'])); unset($data['names']); }
    if (isset($data['address_1']) && is_array($data['address_1'])) { $data['address'] = implode(', ', array_filter($data['address_1'])); unset($data['address_1']); }
    self::send(self::guess($data, 'Fluent Forms: ' . (is_object($form) ? $form->title : 'form')));
  }

  // ---- WooCommerce ----
  public static function woo($order_id) { if (function_exists('wc_get_order')) { $o = wc_get_order($order_id); if ($o) self::woo_obj($o); } }
  public static function woo_obj($o) {
    if (!is_object($o) || !method_exists($o, 'get_id') || $o->get_meta('_bizriva_sent')) return;
    $items = []; $qty = 0;
    foreach ($o->get_items() as $it) { $items[] = $it->get_name() . ' x' . $it->get_quantity(); $qty += (int) $it->get_quantity(); }
    $first = $o->get_items(); $firstName = $first ? reset($first)->get_name() : '';
    self::send([
      'name' => trim($o->get_billing_first_name() . ' ' . $o->get_billing_last_name()),
      'phone' => $o->get_billing_phone(), 'email' => $o->get_billing_email(),
      'address' => trim($o->get_billing_address_1() . ' ' . $o->get_billing_address_2()),
      'city' => trim($o->get_billing_city() . ($o->get_billing_state() ? ', ' . $o->get_billing_state() : '')),
      'product' => $firstName, 'quantity' => (string) max(1, $qty), 'total' => (string) $o->get_total(),
      'note' => 'WooCommerce order #' . $o->get_order_number() . ': ' . implode('; ', $items) . ($o->get_customer_note() ? "\nNote: " . $o->get_customer_note() : '') . "\nPayment: " . $o->get_payment_method_title(),
      'external_id' => 'woo-' . $o->get_id(), 'utm_source' => 'WooCommerce',
    ]);
    $o->update_meta_data('_bizriva_sent', 1); $o->save_meta_data();
  }

  // ---- settings page ----
  public static function menu() { add_options_page('Bizriva', 'Bizriva', 'manage_options', 'bizriva', [__CLASS__, 'page']); }
  public static function register() {
    register_setting('bizriva', self::OPT, ['sanitize_callback' => function ($v) {
      return ['url' => esc_url_raw(trim($v['url'] ?? ''), ['https']), 'key' => sanitize_text_field($v['key'] ?? '')];
    }]);
  }
  public static function page() {
    if (!current_user_can('manage_options')) return;
    if (isset($_POST['bizriva_test']) && check_admin_referer('bizriva_test')) {
      self::send(['name' => 'Bizriva test', 'phone' => '', 'email' => get_option('admin_email'), 'note' => 'Test from ' . home_url(), 'utm_source' => 'WordPress test']);
      echo '<div class="notice notice-success"><p>Test sent — check Website &amp; Forms in Bizriva.</p></div>';
    } ?>
    <div class="wrap"><h1>Bizriva</h1>
      <p>In Bizriva, open <b>Website &amp; Forms → Add a connection → Custom website</b>, then paste its address and secret key here. Every form on this site and every WooCommerce order then goes to Bizriva automatically.</p>
      <form method="post" action="options.php"><?php settings_fields('bizriva'); ?>
        <table class="form-table">
          <tr><th><label for="bz-url">Connection address</label></th><td><input id="bz-url" class="regular-text" name="<?php echo esc_attr(self::OPT); ?>[url]" value="<?php echo esc_attr(self::s('url')); ?>" placeholder="https://….supabase.co/functions/v1/intake/…"></td></tr>
          <tr><th><label for="bz-key">Secret key</label></th><td><input id="bz-key" class="regular-text" type="password" name="<?php echo esc_attr(self::OPT); ?>[key]" value="<?php echo esc_attr(self::s('key')); ?>"></td></tr>
        </table><?php submit_button(); ?></form>
      <form method="post"><?php wp_nonce_field('bizriva_test'); ?><input type="hidden" name="bizriva_test" value="1"><?php submit_button('Send a test', 'secondary'); ?></form>
      <p>Works with Contact Form 7, WPForms, Gravity Forms, Elementor Pro forms, Fluent Forms and WooCommerce.</p>
    </div>
  <?php }
}
Bizriva_Connector::init();
