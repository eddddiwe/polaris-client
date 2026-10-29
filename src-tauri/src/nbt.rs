use flate2::write::GzEncoder;
use flate2::Compression;
use std::io::Write;

/// Encode a servers.dat NBT compound with the given server list.
/// Each server: { name, ip, icon?, acceptTextures? }
pub fn encode_servers_dat(servers: &[(&str, &str, &str, bool)]) -> Vec<u8> {
    // Build NBT data
    let mut buf = Vec::with_capacity(1024);
    // We'll use a Vec<u8> and push bytes

    // Root compound tag (type 10, empty name)
    buf.push(10); // TAG_Compound
    // root name (empty string): length prefix 2 bytes
    buf.push(0);
    buf.push(0);

    // "servers" list tag (type 9)
    // TAG_List = 9
    buf.push(9);
    // name "servers"
    write_nbt_string(&mut buf, "servers");
    // list type: compound (10)
    buf.push(10);
    // count (i32 big-endian)
    let count = servers.len() as i32;
    buf.extend_from_slice(&count.to_be_bytes());

    for (name, ip, icon, accept_textures) in servers {
        // Compound in list (empty name)
        buf.push(10);
        buf.push(0);
        buf.push(0); // empty name

        // name (string) tag: type 8
        buf.push(8);
        write_nbt_string(&mut buf, "name");
        write_nbt_string(&mut buf, name);

        // ip (string)
        buf.push(8);
        write_nbt_string(&mut buf, "ip");
        write_nbt_string(&mut buf, ip);

        // icon (string)
        buf.push(8);
        write_nbt_string(&mut buf, "icon");
        write_nbt_string(&mut buf, icon);

        // acceptTextures (byte, type 1)
        buf.push(1);
        write_nbt_string(&mut buf, "acceptTextures");
        buf.push(if *accept_textures { 1 } else { 0 });

        // End of compound
        buf.push(0);
    }

    // End of root compound
    buf.push(0);

    // Gzip
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(&buf).unwrap();
    encoder.finish().unwrap()
}

fn write_nbt_string(buf: &mut Vec<u8>, s: &str) {
    let bytes = s.as_bytes();
    let len = bytes.len() as u16;
    buf.extend_from_slice(&len.to_be_bytes());
    buf.extend_from_slice(bytes);
}

/// Write a servers.dat file with the CobbleClash server pre-added.
pub fn ensure_servers_dat(instance_dir: &std::path::Path) -> Result<(), String> {
    let servers_path = instance_dir.join("servers.dat");
    if servers_path.exists() {
        return Ok(());
    }
    let data = encode_servers_dat(&[("CobbleClash", "cobbleclash.kinetic.host", "", true)]);
    std::fs::write(&servers_path, data).map_err(|e| e.to_string())?;
    Ok(())
}
